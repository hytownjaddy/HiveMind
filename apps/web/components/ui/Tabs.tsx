"use client";

import { useEffect, type ReactNode } from "react";

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: string;
}

export interface TabsProps {
  readonly tabs: readonly TabItem[];
  readonly active: string;
  readonly onChange: (id: string) => void;
  readonly children?: ReactNode;
}

/** Text tabs with a 2 px underline; `[` and `]` move between enabled tabs (UI-SYSTEM §3, §8). */
export function Tabs({ tabs, active, onChange, children }: TabsProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
      if (event.key !== "[" && event.key !== "]") {
        return;
      }
      const enabled = tabs.filter((tab) => tab.disabled === undefined);
      const position = enabled.findIndex((tab) => tab.id === active);
      const next =
        enabled[
          (position + (event.key === "]" ? 1 : enabled.length - 1)) % enabled.length
        ];
      if (next !== undefined) {
        onChange(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onChange, tabs]);
  return (
    <div className="flex min-h-0 flex-col">
      <div role="tablist" className="flex shrink-0 gap-4 border-b border-border px-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === active}
            disabled={tab.disabled !== undefined}
            title={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={`h-8 border-b-2 text-[12px] ${
              tab.id === active
                ? "border-accent text-text"
                : "border-transparent text-muted"
            } ${tab.disabled !== undefined ? "cursor-not-allowed text-dim" : "hover:text-text"}`}
          >
            {tab.label}
            {tab.disabled !== undefined ? (
              <span className="hm-mono ml-1 text-[10px]">{tab.disabled}</span>
            ) : null}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
