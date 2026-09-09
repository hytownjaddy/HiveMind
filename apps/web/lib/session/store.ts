import type {
  LabRejectionCode,
  LabServerMessage,
  LabSessionSummary,
  SequencedLabEvent,
} from "@hivemind/schema";
import { create } from "zustand";

export type ConnectionStatus =
  "idle" | "connecting" | "synchronizing" | "online" | "offline" | "finished";

export type ApplyResult = { readonly kind: "ok" } | { readonly kind: "resync" };

const MAX_LOG_ENTRIES = 200;

export interface LabStore {
  readonly sessionId: string | null;
  readonly status: ConnectionStatus;
  readonly lastError: string | null;
  readonly lastRejection: LabRejectionCode | null;
  readonly connectionId: string | null;
  readonly clockOffsetMs: number;
  readonly reconnectAttempt: number;
  readonly session: LabSessionSummary | null;
  readonly latestSequence: number;
  /** Non-terminal events (status changes, notices) for the activity log. */
  readonly log: readonly SequencedLabEvent[];
  reset(sessionId: string): void;
  setStatus(status: ConnectionStatus): void;
  setLastError(error: string | null): void;
  setReconnectAttempt(attempt: number): void;
  applyMessage(message: LabServerMessage): ApplyResult;
}

function isLogWorthy(event: SequencedLabEvent): boolean {
  return event.event.type !== "terminal_output";
}

export const useLabStore = create<LabStore>((set, get) => ({
  sessionId: null,
  status: "idle",
  lastError: null,
  lastRejection: null,
  connectionId: null,
  clockOffsetMs: 0,
  reconnectAttempt: 0,
  session: null,
  latestSequence: 0,
  log: [],

  reset(sessionId) {
    set({
      sessionId,
      status: "idle",
      lastError: null,
      lastRejection: null,
      connectionId: null,
      clockOffsetMs: 0,
      reconnectAttempt: 0,
      session: null,
      latestSequence: 0,
      log: [],
    });
  },

  setStatus(status) {
    set({ status });
  },

  setLastError(lastError) {
    set({ lastError });
  },

  setReconnectAttempt(reconnectAttempt) {
    set({ reconnectAttempt });
  },

  applyMessage(message) {
    switch (message.type) {
      case "welcome": {
        set({
          connectionId: message.connectionId,
          clockOffsetMs: message.serverTime - Date.now(),
          status: "synchronizing",
        });
        return { kind: "ok" };
      }
      case "snapshot": {
        set({
          session: message.session,
          latestSequence: message.latestSequence,
          log: message.recentEvents.filter(isLogWorthy).slice(-MAX_LOG_ENTRIES),
          status: "online",
          reconnectAttempt: 0,
          lastError: null,
        });
        return { kind: "ok" };
      }
      case "event": {
        const { latestSequence, session, log } = get();
        if (message.sequence <= latestSequence) {
          return { kind: "ok" };
        }
        if (message.sequence !== latestSequence + 1) {
          return { kind: "resync" };
        }
        const sequenced: SequencedLabEvent = {
          sequence: message.sequence,
          revision: message.revision,
          at: message.at,
          event: message.event,
        };
        const nextSession =
          session === null
            ? null
            : message.event.type === "status_changed"
              ? {
                  ...session,
                  status: message.event.to,
                  revision: message.revision,
                  updatedAt: message.at,
                }
              : { ...session, revision: Math.max(session.revision, message.revision) };
        set({
          latestSequence: message.sequence,
          session: nextSession,
          log: isLogWorthy(sequenced) ? [...log, sequenced].slice(-MAX_LOG_ENTRIES) : log,
        });
        return { kind: "ok" };
      }
      case "rejected": {
        set({ lastRejection: message.code });
        return message.code === "resync-required" ? { kind: "resync" } : { kind: "ok" };
      }
      case "resync_required": {
        return { kind: "resync" };
      }
    }
  },
}));
