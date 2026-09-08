import {
  CLOSE_CODES,
  GUEST_SESSION_COOKIE,
  PROTOCOL_VERSION,
  issueGuestSession,
  labServerMessageSchema,
  labSessionSummarySchema,
  type LabServerMessage,
  type LabSessionSummary,
} from "@hivemind/protocol";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const SECRET = "test-secret-that-is-at-least-32-bytes-long";
const ORIGIN = "http://localhost:3000";
const BASE = "https://realtime.test";

async function guestHeaders(): Promise<Record<string, string>> {
  const { token } = await issueGuestSession(SECRET);
  return { cookie: `${GUEST_SESSION_COOKIE}=${token}`, origin: ORIGIN };
}

async function createSession(
  headers: Record<string, string>,
): Promise<LabSessionSummary> {
  const response = await SELF.fetch(`${BASE}/realtime/labs`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ capability: "terminal.linux", problemRef: "scaffold.echo#1" }),
  });
  expect(response.status).toBe(201);
  return labSessionSummarySchema.parse(await response.json());
}

async function readSummary(
  headers: Record<string, string>,
  sessionId: string,
): Promise<LabSessionSummary> {
  const response = await SELF.fetch(`${BASE}/realtime/labs/${sessionId}`, { headers });
  expect(response.status).toBe(200);
  return labSessionSummarySchema.parse(await response.json());
}

async function waitFor<T>(
  probe: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 5_000,
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
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

interface OpenSocket {
  readonly socket: WebSocket;
  readonly inbox: LabServerMessage[];
  readonly closes: number[];
}

async function openSocket(
  headers: Record<string, string>,
  sessionId: string,
): Promise<OpenSocket> {
  const response = await SELF.fetch(`${BASE}/realtime/labs/${sessionId}/ws`, {
    headers: { ...headers, upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (socket === null) {
    throw new Error("no websocket on 101 response");
  }
  const inbox: LabServerMessage[] = [];
  const closes: number[] = [];
  socket.accept();
  socket.addEventListener("message", (event) => {
    inbox.push(labServerMessageSchema.parse(JSON.parse(String(event.data))));
  });
  socket.addEventListener("close", (event) => {
    closes.push(event.code);
  });
  return { socket, inbox, closes };
}

function sendClient(socket: WebSocket, message: Record<string, unknown>): void {
  socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...message }));
}

describe("gateway", () => {
  it("rejects requests from unknown origins", async () => {
    const response = await SELF.fetch(`${BASE}/realtime/health`, {
      headers: { origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("answers CORS preflight for allowed origins", async () => {
    const response = await SELF.fetch(`${BASE}/realtime/labs`, {
      method: "OPTIONS",
      headers: { origin: ORIGIN },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("requires a guest session", async () => {
    const response = await SELF.fetch(`${BASE}/realtime/labs`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ capability: "terminal.linux" }),
    });
    expect(response.status).toBe(401);
  });

  it("validates the create payload", async () => {
    const headers = await guestHeaders();
    const response = await SELF.fetch(`${BASE}/realtime/labs`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ capability: "not-a-capability" }),
    });
    expect(response.status).toBe(400);
  });
});

describe("LabSession", () => {
  it("provisions to ready through alarms", async () => {
    const headers = await guestHeaders();
    const created = await createSession(headers);
    expect(created.status).toBe("queued");
    expect(created.expiresAt).not.toBeNull();

    const ready = await waitFor(async () => {
      const summary = await readSummary(headers, created.sessionId);
      return summary.status === "ready" ? summary : undefined;
    });
    expect(ready.revision).toBeGreaterThanOrEqual(3);
  });

  it("hides sessions from other guests", async () => {
    const owner = await guestHeaders();
    const other = await guestHeaders();
    const created = await createSession(owner);

    const summary = await SELF.fetch(`${BASE}/realtime/labs/${created.sessionId}`, {
      headers: other,
    });
    expect(summary.status).toBe(404);

    const socket = await SELF.fetch(`${BASE}/realtime/labs/${created.sessionId}/ws`, {
      headers: { ...other, upgrade: "websocket" },
    });
    expect(socket.status).toBe(404);
  });

  it("streams lifecycle events and echoes terminal input", async () => {
    const headers = await guestHeaders();
    const created = await createSession(headers);
    const { socket, inbox } = await openSocket(headers, created.sessionId);

    const welcome = await waitFor(() =>
      inbox.find((message) => message.type === "welcome"),
    );
    expect(welcome.type === "welcome" && welcome.sessionId).toBe(created.sessionId);
    await waitFor(() => inbox.find((message) => message.type === "snapshot"));

    await waitFor(() =>
      inbox.find(
        (message) =>
          (message.type === "event" &&
            message.event.type === "status_changed" &&
            message.event.to === "ready") ||
          (message.type === "snapshot" && message.session.status === "ready"),
      ),
    );

    sendClient(socket, { type: "terminal_input", data: "status\r" });

    const output = await waitFor(() =>
      inbox.find(
        (message) =>
          message.type === "event" &&
          message.event.type === "terminal_output" &&
          message.event.data.includes("echo provider: healthy"),
      ),
    );
    expect(output).toBeDefined();
    await waitFor(() =>
      inbox.find(
        (message) =>
          message.type === "event" &&
          message.event.type === "status_changed" &&
          message.event.from === "ready" &&
          message.event.to === "active",
      ),
    );

    const summary = await readSummary(headers, created.sessionId);
    expect(summary.status).toBe("active");
  });

  it("rejects terminal input before the session is ready", async () => {
    const headers = await guestHeaders();
    const created = await createSession(headers);
    const { socket, inbox } = await openSocket(headers, created.sessionId);
    await waitFor(() => inbox.find((message) => message.type === "snapshot"));

    const snapshot = inbox.find((message) => message.type === "snapshot");
    if (snapshot?.type === "snapshot" && snapshot.session.status !== "ready") {
      sendClient(socket, { type: "terminal_input", data: "x" });
      const rejection = await waitFor(() =>
        inbox.find(
          (message) => message.type === "rejected" && message.code === "not-ready",
        ),
      );
      expect(rejection).toBeDefined();
    }
  });

  it("rejects malformed messages without dropping the socket", async () => {
    const headers = await guestHeaders();
    const created = await createSession(headers);
    const { socket, inbox } = await openSocket(headers, created.sessionId);
    await waitFor(() => inbox.find((message) => message.type === "snapshot"));

    socket.send("not json");
    await waitFor(() =>
      inbox.find(
        (message) => message.type === "rejected" && message.code === "malformed",
      ),
    );
    sendClient(socket, { type: "resync", latestSequence: 0 });
    await waitFor(
      () =>
        inbox.filter((message) => message.type === "snapshot").length >= 2 || undefined,
    );
  });

  it("destroys a session, closes sockets, and refuses new ones", async () => {
    const headers = await guestHeaders();
    const created = await createSession(headers);
    const { inbox, closes } = await openSocket(headers, created.sessionId);
    await waitFor(() => inbox.find((message) => message.type === "snapshot"));

    const destroyed = await SELF.fetch(
      `${BASE}/realtime/labs/${created.sessionId}/destroy`,
      {
        method: "POST",
        headers,
      },
    );
    expect(destroyed.status).toBe(200);
    expect(labSessionSummarySchema.parse(await destroyed.json()).status).toBe(
      "destroyed",
    );

    await waitFor(() => (closes.includes(CLOSE_CODES.finished) ? true : undefined));

    const reopened = await SELF.fetch(`${BASE}/realtime/labs/${created.sessionId}/ws`, {
      headers: { ...headers, upgrade: "websocket" },
    });
    expect(reopened.status).toBe(410);
  });
});
