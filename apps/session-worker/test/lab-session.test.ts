import { parseRecording } from "@hivemind/core";
import {
  SESSION_CLOSE_CODES,
  SESSION_PROTOCOL_VERSION,
  sessionServerMessageSchema,
  sessionSummarySchema,
  type SessionServerMessage,
  type SessionSummary,
} from "@hivemind/schema";
import { env, SELF } from "cloudflare:test";
import { importPKCS8, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

const ORIGIN = "http://localhost:3000";
const BASE = "https://session.test";
const TEAM = "https://hivemind-test.cloudflareaccess.com";
const AUD = "test-aud";

let privateKey: CryptoKey;

/*
 * Access identity for tests: vitest.config.ts pins a throwaway public key
 * through ACCESS_JWKS and hands the private half over as a binding, so the
 * gateway runs the real verification path (D-033) without network access.
 * The loopback agent (PROVIDER_LOOPBACK) plays the lab worker, speaking the
 * worker protocol over the self service binding.
 */
beforeAll(async () => {
  privateKey = await importPKCS8(env.TEST_ACCESS_PRIVATE_KEY, "RS256");
});

async function accessToken(claims: Record<string, string>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(TEAM)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
}

/** Headers for the seeded learner; the first call binds the identity (D-033). */
async function learnerHeaders(
  email = "jacob@example.com",
): Promise<Record<string, string>> {
  return { "cf-access-jwt-assertion": await accessToken({ email }), origin: ORIGIN };
}

async function serviceHeaders(commonName: string): Promise<Record<string, string>> {
  return {
    "cf-access-jwt-assertion": await accessToken({ common_name: commonName }),
    origin: ORIGIN,
  };
}

async function createSession(
  headers: Record<string, string>,
  body: Record<string, unknown> = { archetype: "linux.single", seed: 1 },
): Promise<SessionSummary> {
  const response = await SELF.fetch(`${BASE}/session/labs`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return sessionSummarySchema.parse(await response.json());
}

async function createFailing(
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ status: number; error: string; detail: string }> {
  const response = await SELF.fetch(`${BASE}/session/labs`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as { error: string; detail: string };
  return { status: response.status, ...parsed };
}

async function readSummary(
  headers: Record<string, string>,
  sessionId: string,
): Promise<SessionSummary> {
  const response = await SELF.fetch(`${BASE}/session/labs/${sessionId}`, { headers });
  expect(response.status).toBe(200);
  return sessionSummarySchema.parse(await response.json());
}

async function waitFor<T>(
  probe: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 8_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error("waitFor timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function waitForStatus(
  headers: Record<string, string>,
  sessionId: string,
  status: SessionSummary["status"],
): Promise<SessionSummary> {
  return waitFor(async () => {
    const summary = await readSummary(headers, sessionId);
    return summary.status === status ? summary : undefined;
  });
}

interface OpenSocket {
  readonly socket: WebSocket;
  readonly inbox: SessionServerMessage[];
  readonly closes: number[];
}

async function openSocket(
  headers: Record<string, string>,
  sessionId: string,
): Promise<OpenSocket> {
  const response = await SELF.fetch(`${BASE}/session/labs/${sessionId}/ws`, {
    headers: { ...headers, upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (socket === null) {
    throw new Error("no websocket on 101 response");
  }
  const inbox: SessionServerMessage[] = [];
  const closes: number[] = [];
  socket.accept();
  socket.addEventListener("message", (event) => {
    inbox.push(sessionServerMessageSchema.parse(JSON.parse(String(event.data))));
  });
  socket.addEventListener("close", (event) => {
    closes.push(event.code);
  });
  await waitFor(() => inbox.find((message) => message.type === "snapshot"));
  return { socket, inbox, closes };
}

function sendClient(socket: WebSocket, message: Record<string, unknown>): void {
  socket.send(JSON.stringify({ protocol_version: SESSION_PROTOCOL_VERSION, ...message }));
}

function ptyText(inbox: readonly SessionServerMessage[], node: string): string {
  return inbox
    .filter((message) => message.type === "pty_output" && message.node === node)
    .map((message) => (message.type === "pty_output" ? message.data : ""))
    .join("");
}

async function openTerminal(
  socket: WebSocket,
  inbox: SessionServerMessage[],
  node: string,
): Promise<void> {
  sendClient(socket, { type: "pty_open", node, size: { cols: 100, rows: 30 } });
  await waitFor(() =>
    inbox.find((message) => message.type === "pty_ready" && message.node === node),
  );
}

async function typeAndWait(
  socket: WebSocket,
  inbox: SessionServerMessage[],
  node: string,
  line: string,
  expected: string,
): Promise<void> {
  sendClient(socket, { type: "pty_input", node, data: `${line}\r` });
  await waitFor(() => (ptyText(inbox, node).includes(expected) ? true : undefined));
}

describe("gateway", () => {
  it("answers health without an origin or identity", async () => {
    const response = await SELF.fetch(`${BASE}/session/health`);
    expect(response.status).toBe(200);
  });

  it("rejects requests from unknown origins and without identity", async () => {
    const evil = await SELF.fetch(`${BASE}/session/labs`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ archetype: "linux.single", seed: 1 }),
    });
    expect(evil.status).toBe(403);
    const anonymous = await SELF.fetch(`${BASE}/session/labs`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ archetype: "linux.single", seed: 1 }),
    });
    expect(anonymous.status).toBe(401);
    const forged = await SELF.fetch(`${BASE}/session/labs`, {
      method: "POST",
      headers: {
        "cf-access-jwt-assertion": "eyJ.forged.token",
        origin: ORIGIN,
        "content-type": "application/json",
      },
      body: JSON.stringify({ archetype: "linux.single", seed: 1 }),
    });
    expect(forged.status).toBe(401);
  });

  it("validates the create payload and names unknown archetypes", async () => {
    const headers = await learnerHeaders();
    expect((await createFailing(headers, { archetype: "nope" })).status).toBe(400);
    const unknown = await createFailing(headers, { archetype: "linux.nope", seed: 1 });
    expect(unknown.status).toBe(404);
    expect(unknown.error).toBe("unknown_archetype");
    const badParam = await createFailing(headers, {
      archetype: "bgp.dual_spine",
      seed: 1,
      parameters: { leaf_count: 99 },
    });
    expect(badParam.status).toBe(422);
    expect(badParam.detail).toContain("leaf_count");
  });

  it("rejects an identity that is not the seeded learner", async () => {
    await createSession(await learnerHeaders());
    const stranger = await createFailing(await learnerHeaders("stranger@example.com"), {
      archetype: "linux.single",
      seed: 1,
    });
    expect(stranger.status).toBe(403);
  });

  it("lets a lab:operate service token act for the bound learner, and no other scope", async () => {
    await createSession(await learnerHeaders()); // binds the learner
    const operator = await createSession(await serviceHeaders("test-cli.access"), {
      archetype: "linux.basic",
      seed: 2,
    });
    expect(operator.learner_id).toBe("HM-LRN-000001");
    expect(operator.archetype).toBe("linux.single");
    const nobody = await createFailing(await serviceHeaders("test-nobody.access"), {
      archetype: "linux.single",
      seed: 1,
    });
    expect(nobody.status).toBe(403);
    const list = await SELF.fetch(`${BASE}/session/labs`, {
      headers: await serviceHeaders("test-cli.access"),
    });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { sessions: { id: string }[] };
    expect(body.sessions.map((s) => s.id)).toContain(operator.id);
  });

  it("only lab workers may call the worker surface", async () => {
    const asLearner = await SELF.fetch(`${BASE}/session/worker/heartbeat`, {
      method: "POST",
      headers: { ...(await learnerHeaders()), "content-type": "application/json" },
      body: "{}",
    });
    expect(asLearner.status).toBe(403);
    const unscoped = await SELF.fetch(`${BASE}/session/worker/heartbeat`, {
      method: "POST",
      headers: {
        ...(await serviceHeaders("test-nobody.access")),
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(unscoped.status).toBe(403);
  });
});

describe("LabSession with the loopback lab worker", () => {
  it("allocates ids from D1, selects a provider by capability, and reaches ready", async () => {
    const headers = await learnerHeaders();
    const created = await createSession(headers, {
      archetype: "bgp.dual_spine",
      seed: 7,
    });
    expect(created.id).toMatch(/^HM-LAB-\d{6}$/u);
    expect(created.status).toBe("queued");
    expect(created.provider_id).toBe("loopback-worker");
    expect(created.provider_class).toBe("B");
    expect(created.requires).toContain("routing.frr");
    expect(created.nodes.map((node) => node.name)).toEqual(
      expect.arrayContaining(["spine1", "spine2", "leaf1", "leaf2"]),
    );
    expect(created.hard_ttl_at).not.toBeNull();

    const ready = await waitForStatus(headers, created.id, "ready");
    expect(ready.revision).toBeGreaterThanOrEqual(3);
    expect(ready.nodes.every((node) => node.address !== undefined)).toBe(true);
    expect(ready.worker_id).toBe("loopback-worker");

    const second = await createSession(headers, { archetype: "linux.single", seed: 3 });
    expect(Number(second.id.slice(-6))).toBe(Number(created.id.slice(-6)) + 1);
    expect(second.provider_class).toBe("C");

    const events = await SELF.fetch(`${BASE}/session/labs/${created.id}/events`, {
      headers,
    });
    const log = (await events.json()) as { events: { event: { type: string } }[] };
    expect(log.events.map((entry) => entry.event.type)).toEqual([
      "status_changed",
      "status_changed",
      "status_changed",
      "notice",
    ]);
    const row = await env.DB.prepare(
      "SELECT status, provider_id, provider_class, worker_id FROM lab_sessions WHERE id = ?",
    )
      .bind(created.id)
      .first<{
        status: string;
        provider_id: string;
        provider_class: string;
        worker_id: string;
      }>();
    expect(row).toEqual({
      status: "ready",
      provider_id: "loopback-worker",
      provider_class: "B",
      worker_id: "loopback-worker",
    });
    const durable = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM lab_session_events WHERE lab_session_id = ?",
    )
      .bind(created.id)
      .first<{ n: number }>();
    expect(durable?.n).toBe(4);
  });

  it("relays per-node terminals: echo, resize, and reconnect to the same PTY", async () => {
    const headers = await learnerHeaders();
    const created = await createSession(headers, { archetype: "linux.pair", seed: 11 });
    await waitForStatus(headers, created.id, "ready");
    const first = await openSocket(headers, created.id);

    await openTerminal(first.socket, first.inbox, "host1");
    await typeAndWait(
      first.socket,
      first.inbox,
      "host1",
      "echo hello-relay",
      "hello-relay",
    );
    expect(ptyText(first.inbox, "host1")).toContain("host1:~$ ");
    sendClient(first.socket, {
      type: "pty_resize",
      node: "host1",
      size: { cols: 120, rows: 40 },
    });
    await typeAndWait(first.socket, first.inbox, "host1", "stty size", "40 120");

    // A second node has its own PTY.
    await openTerminal(first.socket, first.inbox, "host2");
    await typeAndWait(first.socket, first.inbox, "host2", "hostname", "host2");
    expect(ptyText(first.inbox, "host1")).not.toContain("host2\r\n");

    // The session became active on first input.
    const active = await waitForStatus(headers, created.id, "active");
    expect(active.status).toBe("active");

    // Drop the browser socket and reconnect: the same PTY (scrollback) comes back.
    first.socket.close(1000, "network drop");
    const second = await openSocket(headers, created.id);
    await openTerminal(second.socket, second.inbox, "host1");
    await waitFor(() =>
      ptyText(second.inbox, "host1").includes("hello-relay") ? true : undefined,
    );
    await typeAndWait(
      second.socket,
      second.inbox,
      "host1",
      "echo still-here",
      "still-here",
    );

    // Unknown nodes and malformed frames are rejected without dropping the socket.
    sendClient(second.socket, { type: "pty_input", node: "ghost", data: "x" });
    await waitFor(() =>
      second.inbox.find((m) => m.type === "rejected" && m.code === "unknown_node"),
    );
    second.socket.send("not json");
    await waitFor(() =>
      second.inbox.find((m) => m.type === "rejected" && m.code === "malformed"),
    );
    expect(second.closes).toEqual([]);
  });

  it("rejects terminal input before the session is ready", async () => {
    const headers = await learnerHeaders();
    // The loopback agent takes 1.5 s to provision this seed.
    const created = await createSession(headers, {
      archetype: "linux.single",
      seed: 444444,
    });
    const { socket, inbox } = await openSocket(headers, created.id);
    sendClient(socket, { type: "pty_input", node: "host1", data: "x" });
    await waitFor(() =>
      inbox.find(
        (message) => message.type === "rejected" && message.code === "not_ready",
      ),
    );
    await waitForStatus(headers, created.id, "ready");
    await openTerminal(socket, inbox, "host1");
    await typeAndWait(socket, inbox, "host1", "hostname", "host1");
  });

  it("destroys through the worker, closes sockets, stores a redacted recording, and refuses new sockets", async () => {
    const headers = await learnerHeaders();
    const created = await createSession(headers, { archetype: "linux.single", seed: 8 });
    await waitForStatus(headers, created.id, "ready");
    const { socket, inbox, closes } = await openSocket(headers, created.id);
    await openTerminal(socket, inbox, "host1");
    await typeAndWait(
      socket,
      inbox,
      "host1",
      "echo token=ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    );
    // The live relay is unredacted; only storage is (D-019).
    expect(ptyText(inbox, "host1")).toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");

    const destroyed = await SELF.fetch(`${BASE}/session/labs/${created.id}/destroy`, {
      method: "POST",
      headers,
    });
    expect(destroyed.status).toBe(200);
    const final = await waitForStatus(headers, created.id, "destroyed");
    expect(final.reason).toBe("requested");
    await waitFor(() =>
      closes.includes(SESSION_CLOSE_CODES.finished) ? true : undefined,
    );

    const recordingKey = await waitFor(async () => {
      const summary = await readSummary(headers, created.id);
      return summary.recording_key ?? undefined;
    });
    expect(recordingKey).toMatch(/^recordings\/HM-LAB-\d{6}\/host1-.*\.cast$/u);
    const object = await waitFor(
      async () => (await env.ARTIFACTS?.get(recordingKey)) ?? undefined,
    );
    const recording = parseRecording(await object.text());
    expect(recording.header.hivemind.node).toBe("host1");
    expect(recording.header.hivemind.redaction_version).toBe("1.0.0");
    const text = recording.events.map(([, , data]) => data).join("");
    expect(text).toContain("echo token=[REDACTED SECRET]");
    expect(text).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(recording.events.some(([, kind]) => kind === "r")).toBe(false);

    const reopened = await SELF.fetch(`${BASE}/session/labs/${created.id}/ws`, {
      headers: { ...headers, upgrade: "websocket" },
    });
    expect(reopened.status).toBe(410);
    const row = await env.DB.prepare(
      "SELECT status, reason, finished_at, recording_keys_json FROM lab_sessions WHERE id = ?",
    )
      .bind(created.id)
      .first<{
        status: string;
        reason: string;
        finished_at: string;
        recording_keys_json: string;
      }>();
    expect(row?.status).toBe("destroyed");
    expect(row?.finished_at).not.toBeNull();
    expect(JSON.parse(row?.recording_keys_json ?? "{}")).toHaveProperty("host1");
  });

  it("fails a session when the worker reports an error, and caps the hard TTL", async () => {
    const headers = await learnerHeaders();
    const created = await createSession(headers, {
      archetype: "linux.single",
      seed: 424242,
      ttl_minutes: 5,
    });
    const failed = await waitForStatus(headers, created.id, "failed");
    expect(failed.reason).toContain("containerlab_deploy_failed");
    const ttl = Date.parse(failed.hard_ttl_at ?? "") - Date.parse(failed.created_at);
    expect(ttl).toBeLessThanOrEqual(5 * 60_000 + 1_000);
    const row = await env.DB.prepare(
      "SELECT status, reason FROM lab_sessions WHERE id = ?",
    )
      .bind(created.id)
      .first<{ status: string; reason: string }>();
    expect(row?.status).toBe("failed");
    expect(row?.reason).toContain("containerlab_deploy_failed");
    const reopened = await SELF.fetch(`${BASE}/session/labs/${created.id}/ws`, {
      headers: { ...headers, upgrade: "websocket" },
    });
    expect(reopened.status).toBe(410);
  });

  it("a worker that never reports hits the job timeout deadline (idempotent alarm)", async () => {
    const headers = await learnerHeaders();
    const created = await createSession(headers, {
      archetype: "linux.single",
      seed: 434343,
    });
    await waitForStatus(headers, created.id, "provisioning");
    // Fire the object's alarm early, twice: the deadline is consumed once.
    const stub = env.LAB_SESSIONS.get(env.LAB_SESSIONS.idFromName(created.id));
    const expire = "https://lab.internal/internal/test/expire?kind=job_timeout";
    await stub.fetch(expire, { method: "POST" });
    await stub.fetch(expire, { method: "POST" });
    const failed = await waitForStatus(headers, created.id, "failed");
    expect(failed.reason).toContain("provision_timeout");
    const events = await SELF.fetch(`${BASE}/session/labs/${created.id}/events`, {
      headers,
    });
    const log = (await events.json()) as {
      events: { event: { type: string; to?: string } }[];
    };
    expect(log.events.filter((e) => e.event.to === "failed")).toHaveLength(1);
  });

  it("reconciliation: the worker's report fails sessions it no longer has and lists the rest", async () => {
    const headers = await learnerHeaders();
    const first = await createSession(headers, { archetype: "linux.single", seed: 21 });
    const second = await createSession(headers, { archetype: "linux.single", seed: 22 });
    await waitForStatus(headers, first.id, "ready");
    await waitForStatus(headers, second.id, "ready");
    const response = await SELF.fetch(`${BASE}/session/worker/reconcile`, {
      method: "POST",
      headers: {
        ...(await serviceHeaders("test-worker.access")),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        protocol_version: 1,
        message_id: crypto.randomUUID(),
        sent_at: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
        sender: { kind: "lab_worker", id: "loopback-worker" },
        message: {
          type: "event.reconcile",
          worker_id: "loopback-worker",
          sessions: [{ lab_session_id: second.id, handle: "loopback", nodes: ["host1"] }],
          at: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
        },
      }),
    });
    expect(response.status).toBe(200);
    const reply = (await response.json()) as {
      message: { type: string; sessions: { lab_session_id: string }[] };
    };
    expect(reply.message.type).toBe("reconcile.expected");
    expect(reply.message.sessions.map((s) => s.lab_session_id)).toEqual([second.id]);
    const lost = await waitForStatus(headers, first.id, "failed");
    expect(lost.reason).toContain("worker_lost_session");
  });

  it("registers workers by heartbeat and refuses labs no online provider can run", async () => {
    const headers = await learnerHeaders();
    await createSession(headers); // registers the loopback worker
    const beat = await SELF.fetch(`${BASE}/session/worker/heartbeat`, {
      method: "POST",
      headers: {
        ...(await serviceHeaders("test-worker.access")),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        protocol_version: 1,
        message_id: crypto.randomUUID(),
        sent_at: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
        sender: { kind: "lab_worker", id: "ubuntu-lab-worker-1" },
        message: {
          type: "heartbeat",
          worker_id: "ubuntu-lab-worker-1",
          capabilities: ["shell.linux"],
          active_sessions: 0,
          load: { cpu_percent: 1, memory_percent: 2 },
          runtime_versions: { docker: "28.5.1" },
          at: new Date().toISOString().replace(/\.\d{3}Z$/u, "Z"),
          endpoint: "https://lab-worker.jryans.dev",
          agent_version: "0.2.0",
        },
      }),
    });
    expect(beat.status).toBe(200);
    const worker = ((await beat.json()) as { worker: { status: string } }).worker;
    expect(worker.status).toBe("online");
    const workers = await env.DB.prepare("SELECT id FROM lab_workers ORDER BY id").all<{
      id: string;
    }>();
    expect(workers.results.map((w) => w.id)).toEqual([
      "loopback-worker",
      "ubuntu-lab-worker-1",
    ]);
  });
});
