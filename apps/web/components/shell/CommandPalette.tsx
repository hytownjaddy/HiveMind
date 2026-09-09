"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LIVE_ITEMS } from "./nav";

/*
 * Command palette and global shortcuts (UI-SYSTEM §8). Commands are
 * namespaced; `g <key>` jumps to a live screen; `?` lists shortcuts; Esc closes.
 */

interface Command {
  readonly id: string;
  readonly label: string;
  readonly shortcut?: string;
  readonly run: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<string | null>(null);

  const commands = useMemo<Command[]>(
    () => [
      ...LIVE_ITEMS.map((item) => ({
        id: `nav:${item.label.toLowerCase().replace(/\s+/gu, "-")}`,
        label: `nav: ${item.label}`,
        ...(item.key === undefined ? {} : { shortcut: `g ${item.key}` }),
        run: () => router.push(item.href),
      })),
      {
        id: "wo:new",
        label: "wo: new work order",
        shortcut: "n",
        run: () => router.push("/work-orders?new=1"),
      },
      {
        id: "system:shortcuts",
        label: "system: keyboard shortcuts",
        shortcut: "?",
        run: () => setHelp(true),
      },
    ],
    [router],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle.length === 0
      ? commands
      : commands.filter((command) => command.label.toLowerCase().includes(needle));
  }, [commands, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setIndex(0);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      if (event.key === "Escape") {
        close();
        setHelp(false);
        return;
      }
      if (typing || open) {
        return;
      }
      if (event.key === "?") {
        setHelp(true);
        return;
      }
      if (pending.current === "g") {
        pending.current = null;
        const item = LIVE_ITEMS.find((candidate) => candidate.key === event.key);
        if (item !== undefined) {
          router.push(item.href);
        }
        return;
      }
      if (event.key === "g") {
        pending.current = "g";
        setTimeout(() => {
          pending.current = null;
        }, 800);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, open, router]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hm-mono flex h-7 flex-1 items-center gap-2 rounded-sm border border-border bg-bg px-2 text-left text-[12px] text-dim hover:text-muted"
        aria-haspopup="dialog"
      >
        <span>⌘K</span>
        <span>search / commands…</span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Command palette"
          className="fixed inset-0 z-50 bg-black/50"
          onClick={close}
        >
          <div
            className="mx-auto mt-24 w-[560px] rounded-md border border-border bg-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setIndex((value) => Math.min(value + 1, matches.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setIndex((value) => Math.max(value - 1, 0));
                } else if (event.key === "Enter") {
                  const command = matches[index];
                  if (command !== undefined) {
                    close();
                    command.run();
                  }
                }
              }}
              placeholder="nav: courses · wo: new · system: shortcuts"
              className="hm-mono h-9 w-full border-b border-border bg-transparent px-3 text-[13px] outline-none"
            />
            <ul className="max-h-80 overflow-y-auto py-1">
              {matches.length === 0 ? (
                <li className="hm-mono px-3 py-2 text-[12px] text-dim">no commands</li>
              ) : null}
              {matches.map((command, position) => (
                <li key={command.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setIndex(position)}
                    onClick={() => {
                      close();
                      command.run();
                    }}
                    className={`hm-mono flex h-7 w-full items-center justify-between px-3 text-left text-[12px] ${
                      position === index ? "bg-panel-2 text-text" : "text-muted"
                    }`}
                  >
                    <span>{command.label}</span>
                    {command.shortcut !== undefined ? (
                      <kbd className="text-[10px] text-dim">{command.shortcut}</kbd>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {help ? (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setHelp(false)}
        >
          <div
            className="mx-auto mt-24 w-[420px] rounded-md border border-border bg-panel p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="hm-label mb-2">Keyboard shortcuts</div>
            <table className="hm-mono w-full text-[12px]">
              <tbody>
                {[
                  ["⌘ K", "command palette"],
                  ...LIVE_ITEMS.filter((item) => item.key !== undefined).map((item) => [
                    `g ${item.key}`,
                    item.label.toLowerCase(),
                  ]),
                  ["n", "new work order (Work Orders)"],
                  ["[ ]", "previous / next tab"],
                  ["j k", "next / previous lesson (Course Workspace)"],
                  ["?", "this list"],
                  ["Esc", "close"],
                ].map(([keys, label]) => (
                  <tr key={keys}>
                    <td className="py-0.5 pr-4 text-text">{keys}</td>
                    <td className="text-muted">{label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
