import {
  SESSION_CLOSE_CODES,
  SESSION_PROTOCOL_VERSION,
  sessionServerMessageSchema,
  type SequencedSessionEvent,
  type SessionRejectionCode,
  type SessionServerMessage,
  type SessionSummary,
} from "@hivemind/schema";

import type { SocketAttachment } from "./types";

export function readAttachment(socket: WebSocket): SocketAttachment | null {
  const value = socket.deserializeAttachment() as unknown;
  if (
    value === null ||
    typeof value !== "object" ||
    !("sessionId" in value) ||
    !("learnerId" in value) ||
    !("connectionId" in value) ||
    typeof value.sessionId !== "string" ||
    typeof value.learnerId !== "string" ||
    typeof value.connectionId !== "string"
  ) {
    return null;
  }
  return {
    sessionId: value.sessionId,
    learnerId: value.learnerId,
    connectionId: value.connectionId,
  };
}

export function send(socket: WebSocket, message: SessionServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(sessionServerMessageSchema.parse(message)));
  }
}

const V = { protocol_version: SESSION_PROTOCOL_VERSION } as const;

export function sendWelcome(
  socket: WebSocket,
  sessionId: string,
  connectionId: string,
  now: string,
): void {
  send(socket, {
    ...V,
    type: "welcome",
    session_id: sessionId,
    connection_id: connectionId,
    server_time: now,
  });
}

export function sendSnapshot(
  socket: WebSocket,
  session: SessionSummary,
  latestSequence: number,
  recentEvents: readonly SequencedSessionEvent[],
  now: string,
): void {
  send(socket, {
    ...V,
    type: "snapshot",
    session,
    latest_sequence: latestSequence,
    recent_events: [...recentEvents],
    server_time: now,
  });
}

export function sendRejected(
  socket: WebSocket,
  code: SessionRejectionCode,
  revision: number,
  detail?: string,
): void {
  send(socket, {
    ...V,
    type: "rejected",
    code,
    revision,
    ...(detail === undefined ? {} : { detail }),
  });
}

export function broadcastEvent(
  sockets: readonly WebSocket[],
  sequenced: SequencedSessionEvent,
): void {
  for (const socket of sockets) {
    send(socket, {
      ...V,
      type: "event",
      sequence: sequenced.sequence,
      revision: sequenced.revision,
      at: sequenced.at,
      event: sequenced.event,
    });
  }
}

export function broadcastPtyOutput(
  sockets: readonly WebSocket[],
  node: string,
  data: string,
): void {
  for (const socket of sockets) {
    send(socket, { ...V, type: "pty_output", node, data });
  }
}

export function broadcastPtyReady(sockets: readonly WebSocket[], node: string): void {
  for (const socket of sockets) {
    send(socket, { ...V, type: "pty_ready", node });
  }
}

export function broadcastPtyExit(
  sockets: readonly WebSocket[],
  node: string,
  code: number | null,
): void {
  for (const socket of sockets) {
    send(socket, { ...V, type: "pty_exit", node, code });
  }
}

export function closeAll(sockets: readonly WebSocket[], reason: string): void {
  for (const socket of sockets) {
    try {
      socket.close(SESSION_CLOSE_CODES.finished, reason);
    } catch {
      // Already closed.
    }
  }
}
