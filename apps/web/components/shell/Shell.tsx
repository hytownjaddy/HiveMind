import type { ReactNode } from "react";

import type { HealthReport } from "@hivemind/core";

import { Sidebar } from "./Sidebar";
import { StatusBar, type StatusField } from "./StatusBar";
import { TopBar } from "./TopBar";

export interface ShellProps {
  readonly children: ReactNode;
  readonly displayName: string;
  readonly target: string;
  readonly health: HealthReport;
  readonly statusFields?: readonly StatusField[];
}

function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0);
  return parts.length === 0
    ? "?"
    : parts
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2);
}

/** Canonical shell (UI-SYSTEM §1): top bar, grouped sidebar, workspace, status bar. */
export function Shell({
  children,
  displayName,
  target,
  health,
  statusFields = [],
}: ShellProps) {
  const session = health.components.find(
    (component) => component.component === "session_worker",
  );
  const labHostState =
    session?.state === "online"
      ? "online"
      : session?.state === "unconfigured"
        ? "offline"
        : "offline";
  const labHostDetail =
    session?.state === "unconfigured"
      ? "no lab host (Stage 02)"
      : (session?.detail ?? "session worker");
  const connection = health.ok ? "online" : "degraded";
  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        initials={initialsOf(displayName)}
        target={target}
        labHostState={labHostState}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          labHost={{ state: labHostState, detail: labHostDetail }}
          target={target}
        />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <StatusBar version={health.version} connection={connection} fields={statusFields} />
    </div>
  );
}
