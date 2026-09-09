import type { ReactNode } from "react";

export interface PaneProps {
  readonly title: string;
  readonly count?: number;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testId?: string;
}

/** Bordered pane with an uppercase header row and optional actions (UI-SYSTEM §3). */
export function Pane({
  title,
  count,
  actions,
  children,
  className = "",
  testId,
}: PaneProps) {
  return (
    <section
      className={`flex min-h-0 flex-col border border-border bg-panel ${className}`}
      data-testid={testId}
    >
      <header className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="hm-label">
          {title}
          {count !== undefined ? <span className="ml-2 text-dim">{count}</span> : null}
        </h2>
        {actions !== undefined ? (
          <div className="flex items-center gap-2 text-[11px]">{actions}</div>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/** One-line monospace empty state plus the single creating action (§12). */
export function EmptyRow({
  text,
  action,
}: {
  readonly text: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="hm-mono flex items-center gap-3 px-3 py-2 text-[12px] text-muted">
      <span>{text}</span>
      {action}
    </div>
  );
}
