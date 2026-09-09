"use client";

import {
  CLOSE_CODES,
  PROTOCOL_VERSION,
  labServerMessageSchema,
  type LabClientMessage,
} from "@hivemind/schema";

import { reconnectDelayMs } from "./backoff";
import { sessionSocketUrl } from "./origin";
import { fetchLabSession, SessionError } from "./transport";
import { useLabStore } from "./store";

export type WebSocketFactory = (url: string) => WebSocket;

export type TerminalListener = (chunk: {
  kind: "replay" | "output";
  data: string;
}) => void;

const RESYNC_TIMEOUT_MS = 5_000;
const TERMINAL_BUFFER_CHARS = 64 * 1024;

function hasCurrentProtocolVersion(
  value: unknown,
): value is { readonly protocolVersion: typeof PROTOCOL_VERSION } {
  return (
    value !== null &&
    typeof value === "object" &&
    "protocolVersion" in value &&
    value.protocolVersion === PROTOCOL_VERSION
  );
}

/**
 * Browser side of one lab session: ownership check, socket
 * lifecycle, ordered event application, resync, and bounded reconnect.
 * Terminal bytes bypass the store and go straight to subscribed listeners.
 */
export class LabSocket {
  private socket: WebSocket | null = null;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  private resyncRequested = false;
  private readonly terminalListeners = new Set<TerminalListener>();
  /** Screen contents since the last snapshot, so late subscribers can repaint. */
  private terminalBuffer: string | null = null;
  private visibilityHandler: (() => void) | null = null;
  private onlineHandler: (() => void) | null = null;

  constructor(
    private readonly sessionId: string,
    private readonly createSocket: WebSocketFactory = (url) => new WebSocket(url),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async connect(): Promise<void> {
    this.intentionalClose = false;
    const store = useLabStore.getState();
    store.reset(this.sessionId);
    store.setStatus("connecting");
    this.terminalBuffer = null;
    await fetchLabSession(this.sessionId, this.fetchImpl);
    this.bindLifecycle();
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    this.clearResync();
    this.unbindLifecycle();
    this.socket?.close(1000, "client disconnect");
    this.socket = null;
    useLabStore.getState().setStatus("offline");
  }

  onTerminal(listener: TerminalListener): () => void {
    this.terminalListeners.add(listener);
    if (this.terminalBuffer !== null) {
      listener({ kind: "replay", data: this.terminalBuffer });
    }
    return () => {
      this.terminalListeners.delete(listener);
    };
  }

  sendTerminalInput(data: string): void {
    this.send({ protocolVersion: PROTOCOL_VERSION, type: "terminal_input", data });
  }

  sendTerminalResize(cols: number, rows: number): void {
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type: "terminal_resize",
      size: { cols, rows },
    });
  }

  private send(message: LabClientMessage): void {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private emitTerminal(kind: "replay" | "output", data: string): void {
    this.terminalBuffer =
      kind === "replay"
        ? data
        : ((this.terminalBuffer ?? "") + data).slice(-TERMINAL_BUFFER_CHARS);
    for (const listener of this.terminalListeners) {
      listener({ kind, data });
    }
  }

  private openSocket(): void {
    this.clearReconnectTimer();
    const url = sessionSocketUrl(
      `/session/labs/${encodeURIComponent(this.sessionId)}/ws`,
    );
    const socket = this.createSocket(url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket === socket) {
        useLabStore.getState().setStatus("synchronizing");
      }
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket || typeof event.data !== "string") {
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data) as unknown;
      } catch {
        useLabStore.getState().setLastError("malformed-message");
        this.requestResync();
        return;
      }
      if (!hasCurrentProtocolVersion(parsed)) {
        this.intentionalClose = true;
        useLabStore.getState().setLastError("incompatible-protocol");
        useLabStore.getState().setStatus("offline");
        socket.close(1002, "incompatible protocol");
        return;
      }
      const message = labServerMessageSchema.safeParse(parsed);
      if (!message.success) {
        useLabStore.getState().setLastError("incompatible-message");
        this.requestResync();
        return;
      }
      const result = useLabStore.getState().applyMessage(message.data);
      if (message.data.type === "snapshot") {
        this.clearResync();
        const replay = message.data.recentEvents
          .filter((entry) => entry.event.type === "terminal_output")
          .map((entry) =>
            entry.event.type === "terminal_output" ? entry.event.data : "",
          )
          .join("");
        this.emitTerminal("replay", replay);
      } else if (
        message.data.type === "event" &&
        message.data.event.type === "terminal_output" &&
        result.kind === "ok"
      ) {
        this.emitTerminal("output", message.data.event.data);
      }
      if (result.kind === "resync") {
        this.requestResync();
      }
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.clearResync();
      if (event.code === CLOSE_CODES.finished) {
        useLabStore.getState().setStatus("finished");
        this.unbindLifecycle();
        return;
      }
      if (this.intentionalClose) {
        useLabStore.getState().setStatus("offline");
        return;
      }
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      useLabStore.getState().setLastError("socket-error");
    });
  }

  private requestResync(): void {
    const store = useLabStore.getState();
    if (this.intentionalClose || store.status === "finished" || this.resyncRequested) {
      return;
    }
    const socket = this.socket;
    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      this.scheduleReconnect();
      return;
    }
    store.setStatus("synchronizing");
    this.resyncRequested = true;
    socket.send(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: "resync",
        latestSequence: store.latestSequence,
      } satisfies LabClientMessage),
    );
    this.resyncTimer = setTimeout(() => {
      if (this.socket === socket && this.resyncRequested) {
        socket.close(CLOSE_CODES.resync, "resync timeout");
      }
    }, RESYNC_TIMEOUT_MS);
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || this.reconnectTimer !== null) {
      return;
    }
    const store = useLabStore.getState();
    if (store.status === "finished") {
      return;
    }
    const attempt = store.reconnectAttempt;
    store.setStatus("offline");
    store.setReconnectAttempt(attempt + 1);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      store.setStatus("connecting");
      void fetchLabSession(this.sessionId, this.fetchImpl)
        .then((summary) => {
          if (summary.status === "destroyed" || summary.status === "failed") {
            this.intentionalClose = true;
            store.setStatus("finished");
            return;
          }
          this.openSocket();
        })
        .catch((error: unknown) => {
          const code = error instanceof SessionError ? error.code : "session-failed";
          store.setLastError(code);
          if (error instanceof SessionError && error.status === 404) {
            this.intentionalClose = true;
            store.setStatus("offline");
            return;
          }
          this.scheduleReconnect();
        });
    }, reconnectDelayMs(attempt));
  }

  private bindLifecycle(): void {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    const reconnectIfClosed = () => {
      if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
        this.scheduleReconnect();
      }
    };
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        reconnectIfClosed();
      }
    };
    this.onlineHandler = reconnectIfClosed;
    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("online", this.onlineHandler);
  }

  private unbindLifecycle(): void {
    if (this.visibilityHandler !== null) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    if (this.onlineHandler !== null) {
      window.removeEventListener("online", this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearResync(): void {
    this.resyncRequested = false;
    if (this.resyncTimer !== null) {
      clearTimeout(this.resyncTimer);
      this.resyncTimer = null;
    }
  }
}
