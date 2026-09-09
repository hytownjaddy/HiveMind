import {
  CLOSE_CODES,
  FINAL_STATUSES,
  TERMINAL_STATUSES,
  learnerIdSchema,
  labCapabilitySchema,
  labClientMessageSchema,
  labSessionIdSchema,
  problemRefSchema,
  type LabEvent,
  type LabStatus,
  type SequencedLabEvent,
} from "@hivemind/schema";
import { DurableObject } from "cloudflare:workers";

import {
  resolveProvider,
  type LabProvider,
  type ProviderState,
} from "./lab-session/provider";
import {
  broadcastEvent,
  closeAll,
  readAttachment,
  sendRejected,
  sendSnapshot,
  sendWelcome,
} from "./lab-session/sockets";
import { LabSessionRepository } from "./lab-session/storage";
import {
  RETENTION_AFTER_FINAL_MS,
  SNAPSHOT_EVENTS,
  type InternalCreateRequest,
  type SessionRecord,
  type SocketAttachment,
} from "./lab-session/types";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_BODY_BYTES = 8 * 1024;
const PROVISION_DEADLINE_ID = "provision";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(request: Request): Promise<unknown> {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new Error("body-too-large");
  }
  return JSON.parse(body) as unknown;
}

function parseCreateRequest(value: unknown): InternalCreateRequest | null {
  if (!isRecord(value)) {
    return null;
  }
  const sessionId = labSessionIdSchema.safeParse(value.sessionId);
  const learnerId = learnerIdSchema.safeParse(value.learnerId);
  const capability = labCapabilitySchema.safeParse(value.capability);
  const problemRef =
    value.problemRef === undefined || value.problemRef === null
      ? { success: true as const, data: null }
      : problemRefSchema.safeParse(value.problemRef);
  if (
    !sessionId.success ||
    !learnerId.success ||
    !capability.success ||
    !problemRef.success
  ) {
    return null;
  }
  return {
    sessionId: sessionId.data,
    learnerId: learnerId.data,
    capability: capability.data,
    problemRef: problemRef.data,
  };
}

function isFinal(status: LabStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

/**
 * One Durable Object per lab session (RFP §86, §91). It is the single authority
 * for the session's lifecycle, persists the replayable event log and learner
 * telemetry in embedded SQLite, terminates the browser WebSockets, and drives
 * provisioning steps and expiry through a single alarm backed by a deadline
 * queue. A LabProvider supplies the environment behaviour.
 */
export class LabSession extends DurableObject<Env> {
  private readonly repo: LabSessionRepository;
  private readonly provider: LabProvider;
  private readonly providerState: ProviderState = { lineBuffer: "" };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.repo = new LabSessionRepository(ctx.storage);
    this.provider = resolveProvider(env.LAB_PROVIDER || "echo");
    this.repo.ensureSchema();
    // Keepalive pings are answered by the runtime without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /* ----------------------------------------------------------- HTTP surface */

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/internal/create") {
      return this.handleCreate(request);
    }
    if (request.method === "GET" && url.pathname === "/internal/summary") {
      return this.handleSummary(url);
    }
    if (request.method === "POST" && url.pathname === "/internal/destroy") {
      return this.handleDestroy(url);
    }
    if (request.method === "GET" && url.pathname === "/internal/ws") {
      return this.handleWebSocket(url);
    }
    return json({ error: "not-found" }, 404);
  }

  private async handleCreate(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      return json({ error: "malformed" }, 400);
    }
    const parsed = parseCreateRequest(body);
    if (parsed === null) {
      return json({ error: "malformed" }, 400);
    }
    if (this.repo.load() !== null) {
      return json({ error: "conflict" }, 409);
    }
    const now = Date.now();
    const record = this.repo.create(parsed, now);
    this.repo.recordTelemetry(
      "session_created",
      { capability: parsed.capability, problemRef: parsed.problemRef },
      now,
    );
    this.repo.scheduleIdleExpiry(now);
    this.scheduleProvisionStep(record.status, now);
    await this.repo.syncAlarm();
    return json(this.repo.summary(record), 201);
  }

  /** Every learner-facing call must prove ownership; a session id alone grants nothing. */
  private authorize(url: URL): SessionRecord | Response {
    const learnerId = learnerIdSchema.safeParse(url.searchParams.get("learnerId"));
    const record = this.repo.load();
    if (!learnerId.success || record === null || record.learnerId !== learnerId.data) {
      return json({ error: "not-found" }, 404);
    }
    return record;
  }

  private handleSummary(url: URL): Response {
    const record = this.authorize(url);
    if (record instanceof Response) {
      return record;
    }
    return json(this.repo.summary(record));
  }

  private async handleDestroy(url: URL): Promise<Response> {
    const record = this.authorize(url);
    if (record instanceof Response) {
      return record;
    }
    if (!isFinal(record.status)) {
      const now = Date.now();
      this.transition(record.status, "destroying", now, "requested");
      // The echo provider has nothing to tear down; real providers will
      // complete this transition asynchronously from a provider callback.
      this.transition("destroying", "destroyed", now);
      this.finish("destroyed", now);
      await this.repo.syncAlarm();
    }
    const current = this.repo.load();
    return current === null
      ? json({ error: "not-found" }, 404)
      : json(this.repo.summary(current));
  }

  private async handleWebSocket(url: URL): Promise<Response> {
    const record = this.authorize(url);
    if (record instanceof Response) {
      return record;
    }
    if (isFinal(record.status)) {
      return json({ error: "session-finished" }, 410);
    }
    const now = Date.now();
    const connectionId = crypto.randomUUID();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: SocketAttachment = {
      sessionId: record.sessionId,
      learnerId: record.learnerId,
      connectionId,
    };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, ["owner"]);
    this.repo.recordActivity(now);
    this.repo.recordTelemetry("socket_opened", { connectionId }, now);
    this.repo.scheduleIdleExpiry(now);
    await this.repo.syncAlarm();
    sendWelcome(server, record.sessionId, connectionId, now);
    this.sendSnapshotTo(server, now);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ------------------------------------------------------------- WebSockets */

  override async webSocketMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    const attachment = readAttachment(socket);
    const record = this.repo.load();
    if (
      attachment === null ||
      record === null ||
      record.sessionId !== attachment.sessionId ||
      record.learnerId !== attachment.learnerId
    ) {
      socket.close(1008, "Invalid session connection");
      return;
    }
    if (typeof raw !== "string") {
      sendRejected(socket, "malformed", record.revision);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      sendRejected(socket, "malformed", record.revision);
      return;
    }
    const message = labClientMessageSchema.safeParse(parsed);
    if (!message.success) {
      sendRejected(socket, "malformed", record.revision);
      return;
    }

    const now = Date.now();
    switch (message.data.type) {
      case "resync": {
        this.sendSnapshotTo(socket, now);
        return;
      }
      case "terminal_resize": {
        this.repo.setTerminalSize(message.data.size.cols, message.data.size.rows);
        this.repo.recordTelemetry("terminal_resize", message.data.size, now);
        this.repo.recordActivity(now);
        return;
      }
      case "terminal_input": {
        if (isFinal(record.status)) {
          sendRejected(socket, "session-finished", record.revision);
          return;
        }
        if (!TERMINAL_STATUSES.includes(record.status)) {
          sendRejected(socket, "not-ready", record.revision);
          return;
        }
        this.repo.recordTelemetry("terminal_input", { data: message.data.data }, now);
        this.repo.recordActivity(now);
        if (record.status === "ready") {
          this.transition("ready", "active", now, "first-input");
        }
        const output = this.provider.handleInput(message.data.data, this.providerState);
        if (output !== null) {
          this.emitOutput(output, now);
        }
        this.repo.scheduleIdleExpiry(now);
        await this.repo.syncAlarm();
        return;
      }
    }
  }

  override async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    const attachment = readAttachment(socket);
    if (attachment !== null && this.repo.load() !== null) {
      this.repo.recordTelemetry(
        "socket_closed",
        { connectionId: attachment.connectionId, code },
        Date.now(),
      );
    }
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1006);
  }

  /* ------------------------------------------------------------------ alarm */

  override async alarm(): Promise<void> {
    const now = Date.now();
    // Alarm delivery is at least once. Every due deadline is consumed exactly
    // once from SQLite and ignored when the session already moved on.
    for (;;) {
      const due = this.repo.nextDeadline();
      if (due === null || due.dueAt > now) {
        break;
      }
      this.repo.removeDeadline(due.deadlineId);
      const record = this.repo.load();
      if (record === null) {
        break;
      }
      if (due.expectedStatus !== null && due.expectedStatus !== record.status) {
        continue;
      }
      switch (due.kind) {
        case "provision_step": {
          const step = this.provider.provisionStep(record.status);
          if (step === null) {
            break;
          }
          this.transition(record.status, step.next, now);
          if (step.next === "ready") {
            this.emitOutput(
              this.provider.banner(record.capability, record.problemRef),
              now,
            );
          }
          this.scheduleProvisionStep(step.next, now);
          break;
        }
        case "idle_expiry": {
          if (isFinal(record.status)) {
            break;
          }
          this.transition(record.status, "destroying", now, "idle-timeout");
          this.transition("destroying", "destroyed", now);
          this.finish("destroyed", now);
          break;
        }
        case "cleanup": {
          closeAll(this.ctx.getWebSockets(), "cleanup");
          await this.repo.destroyAll();
          return;
        }
      }
    }
    await this.repo.syncAlarm();
  }

  /* ---------------------------------------------------------------- helpers */

  private scheduleProvisionStep(status: LabStatus, now: number): void {
    const step = this.provider.provisionStep(status);
    if (step === null) {
      return;
    }
    this.repo.scheduleDeadline({
      deadlineId: PROVISION_DEADLINE_ID,
      kind: "provision_step",
      dueAt: now + step.delayMs,
      expectedStatus: status,
    });
  }

  private transition(
    from: LabStatus,
    to: LabStatus,
    now: number,
    reason?: string,
  ): SequencedLabEvent {
    const revision = this.repo.setStatus(to, now);
    const event: LabEvent =
      reason === undefined
        ? { type: "status_changed", from, to }
        : { type: "status_changed", from, to, reason };
    const sequenced = this.repo.appendEvent(revision, event, now);
    this.repo.recordTelemetry(
      "status_changed",
      { from, to, reason: reason ?? null },
      now,
    );
    this.repo.scheduleIdleExpiry(now);
    broadcastEvent(this.ctx.getWebSockets(), sequenced);
    return sequenced;
  }

  private emitOutput(data: string, now: number): void {
    const record = this.repo.load();
    if (record === null) {
      return;
    }
    const sequenced = this.repo.appendEvent(
      record.revision,
      { type: "terminal_output", data },
      now,
    );
    broadcastEvent(this.ctx.getWebSockets(), sequenced);
  }

  private finish(status: "destroyed" | "failed", now: number): void {
    closeAll(this.ctx.getWebSockets(), status);
    this.repo.clearDeadlines();
    this.repo.scheduleDeadline({
      deadlineId: "cleanup",
      kind: "cleanup",
      dueAt: now + RETENTION_AFTER_FINAL_MS,
      expectedStatus: status,
    });
  }

  private sendSnapshotTo(socket: WebSocket, now: number): void {
    const record = this.repo.load();
    if (record === null) {
      socket.close(CLOSE_CODES.finished, "no-session");
      return;
    }
    sendSnapshot(
      socket,
      this.repo.summary(record),
      this.repo.latestSequence(),
      this.repo.listRecentEvents(SNAPSHOT_EVENTS),
      now,
    );
  }
}
