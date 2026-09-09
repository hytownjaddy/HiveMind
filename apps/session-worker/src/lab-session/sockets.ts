import {
  CLOSE_CODES,
  PROTOCOL_VERSION,
  labServerMessageSchema,
  type LabRejectionCode,
  type LabServerMessage,
  type LabSessionSummary,
  type SequencedLabEvent,
} from "@hivemind/schema";

import type { SocketAttachment } from "./types";

export function readAttachment(socket: WebSocket): SocketAttachment | null {
  const value = socket.deserializeAttachment() as unknown;
  if (
    value === null ||
    typeof value !== "object" ||
    !("sessionId" in value) ||
    !("guestId" in value) ||
    !("connectionId" in value) ||
    typeof value.sessionId !== "string" ||
    typeof value.guestId !== "string" ||
    typeof value.connectionId !== "string"
  ) {
    return null;
  }
  return {
    sessionId: value.sessionId,
    guestId: value.guestId,
    connectionId: value.connectionId,
  };
}

export function send(socket: WebSocket, message: LabServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(labServerMessageSchema.parse(message)));
  }
}

export function sendWelcome(
  socket: WebSocket,
  sessionId: string,
  connectionId: string,
  now: number,
): void {
  send(socket, {
    protocolVersion: PROTOCOL_VERSION,
    type: "welcome",
    sessionId,
    connectionId,
    serverTime: now,
  });
}

export function sendSnapshot(
  socket: WebSocket,
  session: LabSessionSummary,
  latestSequence: number,
  recentEvents: readonly SequencedLabEvent[],
  now: number,
): void {
  send(socket, {
    protocolVersion: PROTOCOL_VERSION,
    type: "snapshot",
    session,
    latestSequence,
    recentEvents: [...recentEvents],
    serverTime: now,
  });
}

export function sendRejected(
  socket: WebSocket,
  code: LabRejectionCode,
  revision: number,
): void {
  send(socket, { protocolVersion: PROTOCOL_VERSION, type: "rejected", code, revision });
}

export function broadcastEvent(
  sockets: readonly WebSocket[],
  sequenced: SequencedLabEvent,
): void {
  for (const socket of sockets) {
    send(socket, {
      protocolVersion: PROTOCOL_VERSION,
      type: "event",
      sequence: sequenced.sequence,
      revision: sequenced.revision,
      at: sequenced.at,
      event: sequenced.event,
    });
  }
}

export function closeAll(sockets: readonly WebSocket[], reason: string): void {
  for (const socket of sockets) {
    try {
      socket.close(CLOSE_CODES.finished, reason);
    } catch {
      // Already closed.
    }
  }
}
