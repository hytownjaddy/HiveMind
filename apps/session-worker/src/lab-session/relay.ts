import { REDACTION_VERSION, StreamingRedactor } from "@hivemind/core";
import { ptyControlMessageSchema, type PtyControlMessage } from "@hivemind/schema";

import type { SessionProvider } from "../providers/index";
import { SCROLLBACK_CHARS } from "./types";

/*
 * PTY relay: one provider WebSocket per node, kept alive across browser
 * reconnects. Live bytes go to the clients unmodified; the recording path is
 * redacted before it is stored (D-019). When a provider socket drops, the
 * next `pty_open` or input reconnects; the provider replays its scrollback.
 */

export interface RelayEvents {
  output(node: string, data: string): void;
  ready(node: string): void;
  exit(node: string, code: number | null): void;
  error(node: string, message: string): void;
  /** Already redacted frame for the recording. */
  record(node: string, kind: "o" | "i" | "r", data: string): void;
}

interface NodeRelay {
  socket: WebSocket;
  decoder: TextDecoder;
  redactor: StreamingRedactor;
  scrollback: string;
  ready: boolean;
  closed: boolean;
  queue: Promise<void>;
}

/** Binary WebSocket frames arrive as ArrayBuffer or Blob depending on the runtime. */
export async function binaryFrame(data: unknown): Promise<ArrayBuffer | null> {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  }
  if (data instanceof Blob) {
    return data.arrayBuffer();
  }
  return null;
}

export class PtyRelay {
  private readonly nodes = new Map<string, NodeRelay>();

  constructor(
    private readonly sessionId: string,
    private readonly events: RelayEvents,
  ) {}

  get redactionVersion(): string {
    return REDACTION_VERSION;
  }

  isOpen(node: string): boolean {
    const relay = this.nodes.get(node);
    return (
      relay !== undefined && !relay.closed && relay.socket.readyState === WebSocket.OPEN
    );
  }

  scrollback(node: string): string | null {
    return this.nodes.get(node)?.scrollback ?? null;
  }

  async open(
    provider: SessionProvider,
    node: string,
    size: { cols: number; rows: number },
  ): Promise<{ reused: boolean }> {
    if (this.isOpen(node)) {
      this.resize(node, size.cols, size.rows);
      return { reused: true };
    }
    const socket = await provider.openPty({
      sessionId: this.sessionId,
      node,
      cols: size.cols,
      rows: size.rows,
    });
    const relay: NodeRelay = {
      socket,
      decoder: new TextDecoder("utf-8"),
      redactor: new StreamingRedactor(),
      scrollback: "",
      ready: false,
      closed: false,
      queue: Promise.resolve(),
    };
    this.nodes.set(node, relay);
    socket.addEventListener("message", (event) => {
      // Frames are processed strictly in order even though Blob decoding is async.
      relay.queue = relay.queue.then(() =>
        this.onProviderMessage(node, relay, event.data),
      );
    });
    socket.addEventListener("close", () => {
      this.onProviderClosed(node, relay, null);
    });
    socket.addEventListener("error", () => {
      this.onProviderClosed(node, relay, null);
    });
    return { reused: false };
  }

  private async onProviderMessage(
    node: string,
    relay: NodeRelay,
    data: unknown,
  ): Promise<void> {
    if (typeof data === "string") {
      let control: PtyControlMessage;
      try {
        control = ptyControlMessageSchema.parse(JSON.parse(data));
      } catch {
        return;
      }
      switch (control.type) {
        case "ready":
          relay.ready = true;
          this.events.ready(node);
          return;
        case "exit":
          this.onProviderClosed(node, relay, control.code);
          return;
        case "error":
          this.events.error(node, control.message);
          return;
        case "resize":
          return;
      }
    }
    const bytes = await binaryFrame(data);
    if (bytes !== null) {
      const text = relay.decoder.decode(bytes, { stream: true });
      if (text.length === 0) {
        return;
      }
      relay.scrollback = (relay.scrollback + text).slice(-SCROLLBACK_CHARS);
      this.events.output(node, text);
      const redacted = relay.redactor.push(text);
      if (redacted.length > 0) {
        this.events.record(node, "o", redacted);
      }
    }
  }

  private onProviderClosed(node: string, relay: NodeRelay, code: number | null): void {
    if (relay.closed) {
      return;
    }
    relay.closed = true;
    const pending = relay.redactor.flush();
    if (pending.length > 0) {
      this.events.record(node, "o", pending);
    }
    if (this.nodes.get(node) === relay) {
      this.nodes.delete(node);
    }
    this.events.exit(node, code);
  }

  write(node: string, data: string): boolean {
    const relay = this.nodes.get(node);
    if (
      relay === undefined ||
      relay.closed ||
      relay.socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }
    relay.socket.send(new TextEncoder().encode(data));
    return true;
  }

  resize(node: string, cols: number, rows: number): void {
    const relay = this.nodes.get(node);
    if (
      relay === undefined ||
      relay.closed ||
      relay.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    relay.socket.send(JSON.stringify({ type: "resize", cols, rows }));
    this.events.record(node, "r", `${cols}x${rows}`);
  }

  /** Flush pending redaction buffers and close every provider socket. */
  closeAll(): void {
    for (const [node, relay] of [...this.nodes]) {
      if (!relay.closed) {
        relay.closed = true;
        const pending = relay.redactor.flush();
        if (pending.length > 0) {
          this.events.record(node, "o", pending);
        }
        try {
          relay.socket.close(1000, "session finished");
        } catch {
          // Already closed.
        }
      }
      this.nodes.delete(node);
    }
  }
}
