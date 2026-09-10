import {
  SESSION_PROTOCOL_VERSION,
  sessionServerMessageSchema,
  type SessionClientMessage,
} from "@hivemind/schema";

/*
 * `hivemind lab attach`: a raw-mode terminal over the session transport v2.
 * The socket, stdin, and stdout are injected so the loop is testable without
 * a TTY; `Ctrl+]` detaches (the PTY keeps running on the provider).
 */

export const DETACH_BYTE = 0x1d; // Ctrl+]

export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void,
  ): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
}

export interface InputStream {
  on(event: "data", listener: (chunk: Uint8Array | string) => void): unknown;
  setRawMode?: (raw: boolean) => unknown;
  resume?: () => unknown;
  pause?: () => unknown;
  readonly isTTY?: boolean | undefined;
}

export interface OutputStream {
  write(data: string): unknown;
  on?: (event: "resize", listener: () => void) => unknown;
  readonly columns?: number | undefined;
  readonly rows?: number | undefined;
}

export interface AttachOptions {
  readonly node: string;
  readonly socket: SocketLike;
  readonly stdin: InputStream;
  readonly stdout: OutputStream;
  readonly log: (line: string) => void;
}

export type AttachOutcome =
  | { readonly kind: "exit"; readonly code: number | null }
  | { readonly kind: "detached" }
  | { readonly kind: "finished"; readonly reason: string }
  | { readonly kind: "rejected"; readonly code: string; readonly detail?: string };

/** Runs until the PTY exits, the session ends, or the user presses Ctrl+]. */
export function attachTerminal(options: AttachOptions): Promise<AttachOutcome> {
  const { node, socket, stdin, stdout, log } = options;
  const send = (message: SessionClientMessage): void => {
    socket.send(JSON.stringify(message));
  };
  const size = (): { cols: number; rows: number } => ({
    cols: Math.max(1, stdout.columns ?? 80),
    rows: Math.max(1, stdout.rows ?? 24),
  });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: AttachOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      stdin.setRawMode?.(false);
      stdin.pause?.();
      resolve(outcome);
    };
    socket.addEventListener("open", () => {
      log(`attached to ${node}; Ctrl+] detaches`);
    });
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      const parsed = sessionServerMessageSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success) {
        return;
      }
      const message = parsed.data;
      switch (message.type) {
        case "snapshot": {
          // (Re)paint: the provider replays scrollback on open.
          send({
            protocol_version: SESSION_PROTOCOL_VERSION,
            type: "pty_open",
            node,
            size: size(),
          });
          return;
        }
        case "pty_output": {
          if (message.node === node) {
            stdout.write(message.data);
          }
          return;
        }
        case "pty_ready": {
          if (message.node === node) {
            stdin.setRawMode?.(true);
            stdin.resume?.();
          }
          return;
        }
        case "pty_exit": {
          if (message.node === node) {
            socket.close(1000, "pty exited");
            finish({ kind: "exit", code: message.code });
          }
          return;
        }
        case "rejected": {
          if (message.code === "not_ready" || message.code === "malformed") {
            return;
          }
          socket.close(1000, message.code);
          finish({
            kind: "rejected",
            code: message.code,
            ...(message.detail === undefined ? {} : { detail: message.detail }),
          });
          return;
        }
        case "event": {
          if (
            message.event.type === "status_changed" &&
            (message.event.to === "destroyed" || message.event.to === "failed")
          ) {
            finish({
              kind: "finished",
              reason: message.event.reason ?? message.event.to,
            });
          }
          return;
        }
        default:
          return;
      }
    });
    socket.addEventListener("close", (event) => {
      finish({ kind: "finished", reason: event.reason || `closed ${event.code}` });
    });
    socket.addEventListener("error", () => {
      finish({ kind: "finished", reason: "socket error" });
    });
    stdin.on("data", (chunk) => {
      const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
      if (bytes.includes(DETACH_BYTE)) {
        socket.close(1000, "detached");
        finish({ kind: "detached" });
        return;
      }
      send({
        protocol_version: SESSION_PROTOCOL_VERSION,
        type: "pty_input",
        node,
        data: new TextDecoder().decode(bytes),
      });
    });
    stdout.on?.("resize", () => {
      send({
        protocol_version: SESSION_PROTOCOL_VERSION,
        type: "pty_resize",
        node,
        size: size(),
      });
    });
  });
}
