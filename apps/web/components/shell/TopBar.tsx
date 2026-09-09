import Link from "next/link";

import { CommandPalette } from "./CommandPalette";
import { StatusChip } from "../ui/StatusChip";

export interface TopBarProps {
  readonly initials: string;
  readonly target: string;
  readonly labHostState: string;
}

export function TopBar({ initials, target, labHostState }: TopBarProps) {
  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-panel px-3">
      <Link
        href="/"
        className="hm-mono flex items-center gap-2 text-[13px] font-semibold tracking-[0.12em]"
      >
        <span
          aria-hidden
          className="inline-block h-3 w-3 rotate-45 border border-accent"
        />
        HIVEMIND
      </Link>
      <CommandPalette />
      <div
        className="hm-mono flex items-center gap-1 text-[11px] text-muted"
        title="Active target (D-002)"
      >
        <span className="text-dim">target</span>
        <span>{target}</span>
        <span aria-hidden>▾</span>
      </div>
      <div className="flex items-center gap-1 text-[11px]">
        <span className="text-dim">lab host</span>
        <StatusChip kind="connection" value={labHostState} />
      </div>
      <Link href="/settings" aria-label="Settings" className="text-muted hover:text-text">
        ⚙
      </Link>
      <span className="hm-mono flex h-6 w-6 items-center justify-center rounded-sm border border-border text-[11px]">
        {initials}
      </span>
    </header>
  );
}
