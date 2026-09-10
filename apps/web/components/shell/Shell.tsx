import type { ReactNode } from "react";

import type { HealthReport, LabHostSummary } from "@hivemind/core";

import { Sidebar } from "./Sidebar";
import { StatusBar, type StatusField } from "./StatusBar";
import { TopBar } from "./TopBar";

export interface ShellProps {
  readonly children: ReactNode;
  readonly displayName: string;
  readonly target: string;
  readonly health: HealthReport;
  readonly labHost: LabHostSummary;
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
  labHost,
  statusFields = [],
}: ShellProps) {
  const labHostState = labHost.state;
  const connection = health.ok ? "online" : "degraded";
  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        initials={initialsOf(displayName)}
        target={target}
        labHostState={labHostState}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar labHost={labHost} target={target} />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <StatusBar version={health.version} connection={connection} fields={statusFields} />
    </div>
  );
}
