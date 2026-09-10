import type { SessionSummary } from "@hivemind/schema";
import { describe, expect, it } from "vitest";

import { HiveMindApi, type FetchLike } from "./api";
import type { CliConfig } from "./config";
import { run } from "./main";
import type { Output } from "./output";
import { DETACH_BYTE, type SocketLike } from "./terminal";

/*
 * `hivemind lab` against an in-memory session Worker: sessions advance one
 * lifecycle step per poll, and the attach loop runs over a scripted socket.
 */

const config: CliConfig = {
  apiUrl: "http://api.test",
  sessionUrl: "http://session.test",
  accessClientId: "cli.access",
  accessClientSecret: "secret",
  actor: "jacob",
  root: "/tmp",
};

function capture(): Output & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return { lines, errors, log: (l) => lines.push(l), error: (l) => errors.push(l) };
}

function summary(id: string, status: SessionSummary["status"]): SessionSummary {
  return {
    id,
    learner_id: "HM-LRN-000001",
    status,
    archetype: "linux.single",
    archetype_version: "1.0.0",
    seed: 1,
    parameters: {},
    requires: ["shell.linux"],
    provider_id: "loopback-worker",
    provider_class: "C",
    worker_id: "loopback-worker",
    nodes: [{ name: "host1", role: "host", address: "10.250.0.2" }],
    revision: 1,
    created_at: "2026-09-09T12:00:00Z",
    updated_at: "2026-09-09T12:00:00Z",
    expires_at: null,
    hard_ttl_at: "2026-09-09T13:00:00Z",
    reason: status === "failed" ? "containerlab_deploy_failed: boom" : null,
    recording_key: null,
  };
}

function fakeSessionWorker(path: SessionSummary["status"][]): {
  fetch: FetchLike;
  calls: string[];
  headers: Record<string, string>[];
} {
  const calls: string[] = [];
  const headers: Record<string, string>[] = [];
  let step = 0;
  const json = (value: unknown, status = 200): Response =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.host}${url.pathname}${url.search}`);
    headers.push({ ...(init?.headers as Record<string, string>) });
    if (url.pathname === "/session/labs" && method === "POST") {
      return json(summary("HM-LAB-000001", "queued"), 201);
    }
    if (url.pathname === "/session/labs" && method === "GET") {
      return json({
        sessions: [
          {
            ...summary("HM-LAB-000001", "ready"),
            recording_keys: {},
            finished_at: null,
            problem_instance_id: null,
          },
        ],
      });
    }
    if (url.pathname === "/session/labs/HM-LAB-000001") {
      const status = path[Math.min(step, path.length - 1)] ?? "ready";
      step += 1;
      return json(summary("HM-LAB-000001", status));
    }
    if (url.pathname === "/session/labs/HM-LAB-000001/destroy") {
      step = 0;
      return json(summary("HM-LAB-000001", "destroying"));
    }
    if (url.pathname === "/session/labs/HM-LAB-000001/events") {
      return json({
        session: summary("HM-LAB-000001", "ready"),
        events: [
          {
            sequence: 1,
            revision: 1,
            at: "2026-09-09T12:00:01Z",
            event: { type: "status_changed", from: "queued", to: "provisioning" },
          },
          {
            sequence: 2,
            revision: 2,
            at: "2026-09-09T12:00:02Z",
            event: {
              type: "notice",
              text: "linux.single@1.0.0 seed 1 on loopback-worker",
            },
          },
        ],
      });
    }
    return json({ error: "not-found" }, 404);
  };
  return { fetch: fetchImpl, calls, headers };
}

class ScriptedSocket implements SocketLike {
  readonly sent: string[] = [];
  readonly listeners = new Map<string, ((event: never) => void)[]>();
  closed: string | null = null;

  send(data: string): void {
    this.sent.push(data);
    const message = JSON.parse(data) as { type: string; node: string; data?: string };
    if (message.type === "pty_open") {
      this.emit("message", {
        data: JSON.stringify({
          protocol_version: 2,
          type: "pty_output",
          node: "host1",
          data: "host1:~$ ",
        }),
      });
      this.emit("message", {
        data: JSON.stringify({ protocol_version: 2, type: "pty_ready", node: "host1" }),
      });
    }
    if (message.type === "pty_input" && message.data === "exit\r") {
      this.emit("message", {
        data: JSON.stringify({
          protocol_version: 2,
          type: "pty_exit",
          node: "host1",
          code: 0,
        }),
      });
    }
  }

  close(_code?: number, reason?: string): void {
    this.closed = reason ?? "";
  }

  addEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event as never);
    }
  }
}

class FakeStdin {
  private listeners: ((chunk: Uint8Array | string) => void)[] = [];
  raw: boolean | null = null;
  on(_event: "data", listener: (chunk: Uint8Array | string) => void): void {
    this.listeners.push(listener);
  }
  setRawMode(raw: boolean): void {
    this.raw = raw;
  }
  resume(): void {}
  pause(): void {}
  type(text: string | Uint8Array): void {
    for (const listener of this.listeners) {
      listener(text);
    }
  }
}

describe("hivemind lab", () => {
  it("up waits for ready, reports transitions, and attaches on a TTY", async () => {
    const worker = fakeSessionWorker([
      "queued",
      "provisioning",
      "baseline_check",
      "ready",
    ]);
    const out = capture();
    const socket = new ScriptedSocket();
    const stdin = new FakeStdin();
    const written: string[] = [];
    const deps = {
      config,
      api: new HiveMindApi(config, worker.fetch),
      out,
      now: () => "2026-09-09T12:00:00Z",
      sleep: async () => undefined,
      connect: () => socket,
      stdin,
      stdout: { write: (data: string) => written.push(data), columns: 100, rows: 30 },
      interactive: true,
    };
    const running = run(["lab", "up", "linux.basic", "--seed", "1"], deps);
    // The attach loop opens the terminal on snapshot and exits on the shell's exit.
    for (let i = 0; i < 50 && socket.listeners.get("message") === undefined; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    socket.emit("message", {
      data: JSON.stringify({
        protocol_version: 2,
        type: "snapshot",
        session: summary("HM-LAB-000001", "ready"),
        latest_sequence: 0,
        recent_events: [],
        server_time: "2026-09-09T12:00:00Z",
      }),
    });
    stdin.type("exit\r");
    expect(await running).toBe(0);
    expect(worker.calls[0]).toBe("POST session.test/session/labs");
    expect(worker.headers[0]?.["origin"]).toBe("http://api.test");
    expect(worker.headers[0]?.["CF-Access-Client-Id"]).toBe("cli.access");
    expect(out.lines.some((line) => line.includes("HM-LAB-000001 provisioning"))).toBe(
      true,
    );
    expect(out.lines.some((line) => line.includes("HM-LAB-000001 ready"))).toBe(true);
    expect(out.lines.at(-1)).toContain("ready in");
    expect(written.join("")).toContain("host1:~$ ");
    expect(stdin.raw).toBe(false);
    expect(socket.sent.map((s) => (JSON.parse(s) as { type: string }).type)).toEqual([
      "pty_open",
      "pty_input",
    ]);
    expect(out.errors.at(-1)).toContain("shell exited 0");
  });

  it("up reports a failed session with its reason and exits 1", async () => {
    const worker = fakeSessionWorker(["provisioning", "failed"]);
    const out = capture();
    const deps = {
      config,
      api: new HiveMindApi(config, worker.fetch),
      out,
      now: () => "x",
      sleep: async () => undefined,
      interactive: false,
    };
    expect(await run(["lab", "up", "linux.single", "--no-attach"], deps)).toBe(1);
    expect(out.errors.at(-1)).toContain("containerlab_deploy_failed");
  });

  it("ls, logs, and down go through the session Worker", async () => {
    const worker = fakeSessionWorker(["destroying", "destroyed"]);
    const out = capture();
    const deps = {
      config,
      api: new HiveMindApi(config, worker.fetch),
      out,
      now: () => "x",
      sleep: async () => undefined,
      interactive: false,
    };
    expect(await run(["lab", "ls"], deps)).toBe(0);
    expect(out.lines[0]).toContain("HM-LAB-000001  ready");
    expect(await run(["lab", "logs", "HM-LAB-000001"], deps)).toBe(0);
    expect(out.lines.at(-1)).toContain("linux.single@1.0.0 seed 1 on loopback-worker");
    expect(out.lines.at(-2)).toContain("queued → provisioning");
    expect(await run(["lab", "down", "HM-LAB-000001"], deps)).toBe(0);
    expect(worker.calls).toContain(
      "POST session.test/session/labs/HM-LAB-000001/destroy",
    );
    expect(out.lines.at(-1)).toContain("HM-LAB-000001 destroyed");
    expect(await run(["lab", "down", "nope"], deps)).toBe(1);
    expect(out.errors.at(-1)).toContain("expected a session id");
  });

  it("attach detaches on Ctrl+] and leaves the PTY running", async () => {
    const worker = fakeSessionWorker(["ready"]);
    const out = capture();
    const socket = new ScriptedSocket();
    const stdin = new FakeStdin();
    const deps = {
      config,
      api: new HiveMindApi(config, worker.fetch),
      out,
      now: () => "x",
      connect: () => socket,
      stdin,
      stdout: { write: () => undefined, columns: 80, rows: 24 },
    };
    const running = run(["lab", "attach", "HM-LAB-000001", "--node", "host1"], deps);
    for (let i = 0; i < 50 && socket.listeners.get("message") === undefined; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    socket.emit("message", {
      data: JSON.stringify({
        protocol_version: 2,
        type: "snapshot",
        session: summary("HM-LAB-000001", "ready"),
        latest_sequence: 0,
        recent_events: [],
        server_time: "2026-09-09T12:00:00Z",
      }),
    });
    stdin.type("ls\r");
    stdin.type(new Uint8Array([DETACH_BYTE]));
    expect(await running).toBe(0);
    expect(socket.closed).toBe("detached");
    expect(out.errors.at(-1)).toContain("detached from HM-LAB-000001");
    expect(
      socket.sent.some((s) => s.includes('"pty_input"') && s.includes("ls\\r")),
    ).toBe(true);
    await expect(
      run(["lab", "attach", "HM-LAB-000001", "--node", "ghost"], deps),
    ).resolves.toBe(1);
    expect(out.errors.at(-1)).toContain("no node ghost");
  });
});
