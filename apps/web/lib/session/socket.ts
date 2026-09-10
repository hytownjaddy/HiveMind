"use client";

import {
  SESSION_CLOSE_CODES,
  SESSION_PROTOCOL_VERSION,
  sessionServerMessageSchema,
  type SessionClientMessage,
} from "@hivemind/schema";

import { reconnectDelayMs } from "./backoff";
import { sessionSocketUrl } from "./origin";
import { fetchLabSession, SessionError } from "./transport";
import { useLabStore } from "./store";

export type WebSocketFactory = (url: string) => WebSocket;

export type TerminalListener = (chunk: {
  node: string;
  kind: "replay" | "output";
  data: string;
}) => void;

const RESYNC_TIMEOUT_MS = 5_000;
const TERMINAL_BUFFER_CHARS = 64 * 1024;

function hasCurrentProtocolVersion(
  value: unknown,
): value is { readonly protocol_version: typeof SESSION_PROTOCOL_VERSION } {
  return (
    value !== null &&
    typeof value === "object" &&
    "protocol_version" in value &&
    value.protocol_version === SESSION_PROTOCOL_VERSION
  );
}

/**
 * Browser side of one lab session (transport v2): ownership check, socket
 * lifecycle, ordered durable events, resync, bounded reconnect, and per-node
 * terminals. Terminal bytes bypass the store and go straight to subscribed
 * listeners; a reconnect re-opens every node the workspace had opened so the
 * provider replays its scrollback.
 */
export class LabSocket {
  private socket: WebSocket | null = null;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private resyncTimer: ReturnType<typeof setTimeout> | null = null;
  private resyncRequested = false;
  private readonly terminalListeners = new Set<TerminalListener>();
  /** Screen contents per node since the last open, so late subscribers can repaint. */
  private readonly terminalBuffers = new Map<string, string>();
  private readonly openNodes = new Map<string, { cols: number; rows: number }>();
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
    this.terminalBuffers.clear();
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
    for (const [node, data] of this.terminalBuffers) {
      listener({ node, kind: "replay", data });
    }
    return () => {
      this.terminalListeners.delete(listener);
    };
  }

  /** Open (or repaint) a node terminal; re-sent automatically after a reconnect. */
  openTerminal(node: string, cols: number, rows: number): void {
    this.openNodes.set(node, { cols, rows });
    this.terminalBuffers.set(node, "");
    this.send({
      protocol_version: SESSION_PROTOCOL_VERSION,
      type: "pty_open",
      node,
      size: { cols, rows },
    });
  }

  sendTerminalInput(node: string, data: string): void {
    this.send({
      protocol_version: SESSION_PROTOCOL_VERSION,
      type: "pty_input",
      node,
      data,
    });
  }

  sendTerminalResize(node: string, cols: number, rows: number): void {
    this.openNodes.set(node, { cols, rows });
    this.send({
      protocol_version: SESSION_PROTOCOL_VERSION,
      type: "pty_resize",
      node,
      size: { cols, rows },
    });
  }

  private send(message: SessionClientMessage): void {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify(message));
  }

  private emitTerminal(node: string, data: string): void {
    const current = this.terminalBuffers.get(node) ?? "";
    this.terminalBuffers.set(node, (current + data).slice(-TERMINAL_BUFFER_CHARS));
    for (const listener of this.terminalListeners) {
      listener({ node, kind: "output", data });
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
        return;
      }
      if (!hasCurrentProtocolVersion(parsed)) {
        useLabStore.getState().setLastError("protocol-version-mismatch");
        this.intentionalClose = true;
        socket.close(1000, "protocol version mismatch");
        return;
      }
      const message = sessionServerMessageSchema.safeParse(parsed);
      if (!message.success) {
        useLabStore.getState().setLastError("incompatible-message");
        this.requestResync();
        return;
      }
      const result = useLabStore.getState().applyMessage(message.data);
      if (message.data.type === "snapshot") {
        this.clearResync();
        // Re-open every terminal the workspace had; the provider replays scrollback.
        for (const [node, size] of this.openNodes) {
          this.terminalBuffers.set(node, "");
          this.send({
            protocol_version: SESSION_PROTOCOL_VERSION,
            type: "pty_open",
            node,
            size,
          });
        }
      } else if (message.data.type === "pty_output") {
        this.emitTerminal(message.data.node, message.data.data);
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
      if (event.code === SESSION_CLOSE_CODES.finished) {
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
        protocol_version: SESSION_PROTOCOL_VERSION,
        type: "resync",
        latest_sequence: store.latestSequence,
      } satisfies SessionClientMessage),
    );
    this.resyncTimer = setTimeout(() => {
      if (this.socket === socket && this.resyncRequested) {
        socket.close(SESSION_CLOSE_CODES.resync, "resync timeout");
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
