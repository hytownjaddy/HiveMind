"use client";

import { useEffect, useRef } from "react";

import "@xterm/xterm/css/xterm.css";

import type { LabSocket } from "@/lib/session";

/**
 * xterm.js surface bound to one LabSocket (RFP §41). The terminal is created
 * client-side after mount; output replays from the latest snapshot so a
 * reconnect or late mount repaints the screen.
 */
export function Terminal({
  socket,
  enabled,
}: {
  readonly socket: LabSocket;
  readonly enabled: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    let disposed = false;
    let cleanup: () => void = () => {};

    void (async () => {
      const [{ Terminal: XTerm }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) {
        return;
      }
      const term = new XTerm({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        scrollback: 5_000,
        theme: {
          background: "#09090b",
          foreground: "#e4e4e7",
          cursor: "#f5b83d",
          selectionBackground: "#3f3f46",
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();

      const input = term.onData((data) => {
        if (enabledRef.current) {
          socket.sendTerminalInput(data);
        }
      });
      const resize = term.onResize(({ cols, rows }) => {
        socket.sendTerminalResize(cols, rows);
      });
      const unsubscribe = socket.onTerminal((chunk) => {
        if (chunk.kind === "replay") {
          term.reset();
        }
        term.write(chunk.data);
      });
      const observer = new ResizeObserver(() => {
        fit.fit();
      });
      observer.observe(host);
      socket.sendTerminalResize(term.cols, term.rows);

      cleanup = () => {
        observer.disconnect();
        unsubscribe();
        input.dispose();
        resize.dispose();
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [socket]);

  return <div ref={hostRef} className="h-full w-full" />;
}
