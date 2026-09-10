import {
  workerEnvelopeSchema,
  type LabSpec,
  type WorkerEnvelope,
  type WorkerMessage,
} from "@hivemind/schema";

import { binaryFrame } from "../lab-session/relay";

/*
 * Loopback lab agent: an in-Worker emulation of the Python agent's wire
 * behaviour (job intake, asynchronous events, per-node PTY WebSockets with
 * scrollback replay). It lets the LabSession object be tested end to end in
 * workerd without a host, and gives `wrangler dev` a lab to talk to. Never
 * enabled in production (`PROVIDER_LOOPBACK` is only read outside it).
 *
 *   POST /session/loopback/jobs
 *   GET  /session/loopback/sessions/:id/nodes/:node/pty
 */

export const LOOPBACK_ENDPOINT = "https://loopback.internal";
export const LOOPBACK_WORKER_ID = "loopback-worker";
/** Magic seeds that make the loopback agent misbehave on purpose (tests). */
export const LOOPBACK_SEED_FAIL = 424242;
export const LOOPBACK_SEED_HANG = 434343;
export const LOOPBACK_SEED_SLOW = 444444;

interface LoopbackPty {
  scrollback: string;
  cols: number;
  rows: number;
  server: WebSocket | null;
  exited: boolean;
}

interface LoopbackSession {
  spec: LabSpec;
  ptys: Map<string, LoopbackPty>;
}

const sessions = new Map<string, LoopbackSession>();
const DEL = String.fromCharCode(127);

export interface EventSink {
  /** Deliver an agent envelope to the owning object, like the callback path does. */
  deliver(envelope: WorkerEnvelope): Promise<void>;
}

function envelope(
  message: WorkerMessage,
  correlationId: string | undefined,
): WorkerEnvelope {
  return workerEnvelopeSchema.parse({
    protocol_version: 1,
    message_id: crypto.randomUUID(),
    ...(correlationId === undefined ? {} : { correlation_id: correlationId }),
    sent_at: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
    sender: { kind: "lab_worker", id: LOOPBACK_WORKER_ID },
    message,
  });
}

function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
}

/** Deterministic fake shell: echoes input, answers a few commands, keeps scrollback. */
function respond(pty: LoopbackPty, session: string, node: string, line: string): string {
  if (line === "") {
    return "";
  }
  if (line === "stty size") {
    return `${pty.rows} ${pty.cols}\r\n`;
  }
  if (line === "hostname") {
    return `${node}\r\n`;
  }
  if (line === "ip route") {
    return `default via 10.250.0.1 dev eth0\r\n10.250.0.0/24 dev eth0 proto kernel scope link\r\n`;
  }
  if (line.startsWith("echo ")) {
    return `${line.slice(5)}\r\n`;
  }
  if (line === "exit") {
    return "logout\r\n";
  }
  return `${node}: ${line}: command not found\r\n`;
}

export async function handleLoopbackJob(
  request: Request,
  sink: EventSink,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Response> {
  const parsed = workerEnvelopeSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "malformed" }, { status: 400 });
  }
  const message = parsed.data.message;
  const jobId = "job_id" in message ? message.job_id : undefined;
  const run = async (): Promise<void> => {
    switch (message.type) {
      case "job.provision": {
        const id = message.lab_session_id;
        const spec = message.lab_spec;
        if (message.seed === LOOPBACK_SEED_HANG) {
          return; // never reports: exercises the job timeout
        }
        if (message.seed === LOOPBACK_SEED_SLOW) {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
        }
        if (message.seed === LOOPBACK_SEED_FAIL) {
          await sink.deliver(
            envelope(
              {
                type: "event.error",
                job_id: message.job_id,
                lab_session_id: id,
                code: "containerlab_deploy_failed",
                message: "loopback: provisioning failed on request",
                retryable: true,
              },
              jobId,
            ),
          );
          return;
        }
        sessions.set(id, { spec, ptys: new Map() });
        await sink.deliver(
          envelope(
            {
              type: "event.status",
              lab_session_id: id,
              status: "provisioning",
              at: now(),
            },
            jobId,
          ),
        );
        await sink.deliver(
          envelope(
            {
              type: "event.status",
              lab_session_id: id,
              status: "baseline_check",
              at: now(),
              detail: "all nodes up",
            },
            jobId,
          ),
        );
        await sink.deliver(
          envelope(
            {
              type: "event.result",
              job_id: message.job_id,
              lab_session_id: id,
              ok: true,
              result: {
                kind: "provision",
                result: {
                  lab_session_id: id,
                  provider_id: LOOPBACK_WORKER_ID,
                  status: "baseline_check",
                  handle: `loopback-${id.toLowerCase()}`,
                  nodes: spec.nodes.map((node, index) => ({
                    name: node.name,
                    address: `10.250.0.${index + 2}`,
                  })),
                },
              },
            },
            jobId,
          ),
        );
        return;
      }
      case "job.exec": {
        const id = message.lab_session_id;
        const known = sessions.has(id);
        await sink.deliver(
          envelope(
            {
              type: "event.result",
              job_id: message.job_id,
              lab_session_id: id,
              ok: known,
              result: {
                kind: "exec",
                result: {
                  exit_code: known ? 0 : 1,
                  stdout: known ? `${message.command.join(" ")}\n` : "",
                  stderr: known ? "" : "unknown session",
                  duration_ms: 1,
                  timed_out: false,
                },
              },
            },
            jobId,
          ),
        );
        return;
      }
      case "job.destroy": {
        const id = message.lab_session_id;
        const session = sessions.get(id);
        if (session !== undefined) {
          for (const pty of session.ptys.values()) {
            pty.exited = true;
            pty.server?.close(1000, "destroyed");
          }
          sessions.delete(id);
        }
        await sink.deliver(
          envelope(
            { type: "event.status", lab_session_id: id, status: "destroying", at: now() },
            jobId,
          ),
        );
        await sink.deliver(
          envelope(
            {
              type: "event.result",
              job_id: message.job_id,
              lab_session_id: id,
              ok: true,
              result: {
                kind: "destroy",
                result: { lab_session_id: id, destroyed: session !== undefined },
              },
            },
            jobId,
          ),
        );
        return;
      }
      default:
        return;
    }
  };
  // Like the agent: accept first, work later (kept alive past the response).
  waitUntil(run().catch(() => undefined));
  return Response.json({ accepted: parsed.data.message_id }, { status: 202 });
}

export function handleLoopbackPty(
  request: Request,
  sessionId: string,
  node: string,
): Response {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return Response.json({ error: "upgrade-required" }, { status: 426 });
  }
  const url = new URL(request.url);
  const session = sessions.get(sessionId);
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  if (session === undefined || !session.spec.nodes.some((n) => n.name === node)) {
    server.send(
      JSON.stringify({ type: "error", message: `no node ${node} in ${sessionId}` }),
    );
    server.close(1008, "unknown node");
    return new Response(null, { status: 101, webSocket: client });
  }
  const cols = Number(url.searchParams.get("cols") ?? "80");
  const rows = Number(url.searchParams.get("rows") ?? "24");
  let pty = session.ptys.get(node);
  if (pty === undefined || pty.exited) {
    pty = { scrollback: `${node}:~$ `, cols, rows, server: null, exited: false };
    session.ptys.set(node, pty);
  } else {
    pty.cols = cols;
    pty.rows = rows;
  }
  const active = pty;
  active.server = server;
  server.send(new TextEncoder().encode(active.scrollback));
  server.send(JSON.stringify({ type: "ready" }));
  let line = "";
  let queue = Promise.resolve();
  server.addEventListener("message", (event) => {
    queue = queue.then(() => handleFrame(event.data));
  });
  const handleFrame = async (frame: unknown): Promise<void> => {
    if (typeof frame === "string") {
      try {
        const control = JSON.parse(frame) as {
          type?: string;
          cols?: number;
          rows?: number;
        };
        if (
          control.type === "resize" &&
          control.cols !== undefined &&
          control.rows !== undefined
        ) {
          active.cols = control.cols;
          active.rows = control.rows;
        }
      } catch {
        // Ignore malformed control frames like the agent does.
      }
      return;
    }
    const bytes = await binaryFrame(frame);
    if (bytes === null) {
      return;
    }
    const text = new TextDecoder().decode(bytes);
    let output = "";
    for (const char of text) {
      if (char === "\r" || char === "\n") {
        const command = line.trim();
        line = "";
        output += `\r\n${respond(active, sessionId, node, command)}`;
        if (command === "exit") {
          active.scrollback = (active.scrollback + output).slice(-65536);
          server.send(new TextEncoder().encode(output));
          active.exited = true;
          server.send(JSON.stringify({ type: "exit", code: 0, signal: null }));
          server.close(1000, "exited");
          return;
        }
        output += `${node}:~$ `;
      } else if (char === DEL || char === "\b") {
        if (line.length > 0) {
          line = line.slice(0, -1);
          output += "\b \b";
        }
      } else if (char >= " ") {
        line += char;
        output += char;
      }
    }
    if (output.length > 0) {
      active.scrollback = (active.scrollback + output).slice(-65536);
      server.send(new TextEncoder().encode(output));
    }
  };
  server.addEventListener("close", () => {
    if (active.server === server) {
      active.server = null;
    }
  });
  return new Response(null, { status: 101, webSocket: client });
}

/** Test helper: what the loopback agent believes it is running. */
export function loopbackSessions(): string[] {
  return [...sessions.keys()].sort();
}

export function loopbackForget(sessionId: string): void {
  sessions.delete(sessionId);
}
