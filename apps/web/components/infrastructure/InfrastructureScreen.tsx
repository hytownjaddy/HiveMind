"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { InfrastructureOverview } from "@hivemind/core";

import { IdBadge } from "@/components/ui/IdBadge";
import { EmptyRow, Pane } from "@/components/ui/Pane";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs } from "@/components/ui/Tabs";

export type InfrastructureTab =
  | "workers"
  | "sessions"
  | "queue"
  | "runtimes"
  | "jobs"
  | "events"
  | "cloudflare"
  | "configuration";

const TABS: readonly { id: InfrastructureTab; label: string }[] = [
  { id: "workers", label: "Workers" },
  { id: "sessions", label: "Sessions" },
  { id: "queue", label: "Queue" },
  { id: "runtimes", label: "Images & Runtimes" },
  { id: "jobs", label: "Provisioning Jobs" },
  { id: "events", label: "Logs & Events" },
  { id: "cloudflare", label: "Cloudflare" },
  { id: "configuration", label: "Configuration" },
];

const REFRESH_MS = 15_000;

function age(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${Math.round(value)}%`;
}

/** Inline five-cell bar in place of a sparkline until heartbeat history exists. */
function Bar({ value }: { readonly value: number }) {
  const filled = Math.min(5, Math.max(0, Math.round(value / 20)));
  return (
    <span className="hm-mono text-[11px]" aria-label={`${Math.round(value)} percent`}>
      {"▮".repeat(filled)}
      <span className="text-dim">{"▯".repeat(5 - filled)}</span>
    </span>
  );
}

export interface InfrastructureScreenProps {
  readonly overview: InfrastructureOverview;
  readonly initialTab: InfrastructureTab;
}

/** 18-infrastructure-console.md: overview table, eight tabs, `r` refresh, `/` filter. */
export function InfrastructureScreen({
  overview,
  initialTab,
}: InfrastructureScreenProps) {
  const router = useRouter();
  const [tab, setTab] = useState<InfrastructureTab>(initialTab);
  const [filter, setFilter] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const now = Date.parse(overview.checked_at);

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        if (event.key === "Escape") {
          target.blur();
        }
        return;
      }
      if (event.key === "r") {
        router.refresh();
      } else if (event.key === "/") {
        event.preventDefault();
        setTab("sessions");
        filterRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const sessions = overview.sessions.filter((session) => {
    if (filter.length === 0) return true;
    const needle = filter.toLowerCase();
    return (
      session.id.toLowerCase().includes(needle) ||
      (session.archetype ?? "").includes(needle) ||
      session.status.includes(needle) ||
      (session.provider_id ?? "").includes(needle)
    );
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <Pane title="Overview" testId="pane-overview">
        <table className="hm-table">
          <thead>
            <tr>
              <th>overall</th>
              <th className="num">workers online</th>
              <th className="num">running · A</th>
              <th className="num">running · B</th>
              <th className="num">running · C</th>
              <th className="num">sandbox sessions</th>
              <th>d1</th>
              <th>r2</th>
              <th>last export</th>
              <th>checked</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <StatusChip kind="connection" value={overview.overall} />
              </td>
              <td className="num">
                {overview.workers_online}/{overview.workers.length}
              </td>
              <td className="num">{overview.running_by_class.A}</td>
              <td className="num">{overview.running_by_class.B}</td>
              <td className="num">{overview.running_by_class.C}</td>
              <td className="num">{overview.sandbox_sessions}</td>
              <td>
                <StatusChip
                  kind="connection"
                  value={
                    overview.health.components.find((c) => c.component === "d1")?.state ??
                    "unconfigured"
                  }
                />
              </td>
              <td>
                <StatusChip
                  kind="connection"
                  value={
                    overview.health.components.find((c) => c.component === "r2")?.state ??
                    "unconfigured"
                  }
                />
              </td>
              <td className="hm-mono text-muted">
                {overview.last_export === null ? "none" : overview.last_export.key}
              </td>
              <td className="hm-mono text-muted">{overview.checked_at}</td>
            </tr>
          </tbody>
        </table>
      </Pane>

      <Pane
        title="Lab infrastructure"
        testId="pane-infrastructure"
        className="min-h-0 flex-1"
        actions={
          <>
            <input
              ref={filterRef}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="/ filter sessions"
              aria-label="filter sessions"
              className="hm-mono h-6 w-56 border border-border bg-bg px-2 text-[11px]"
            />
            <button
              type="button"
              onClick={() => router.refresh()}
              className="hm-mono h-6 border border-border px-2 text-[11px] text-muted hover:text-text"
            >
              refresh <kbd className="text-dim">r</kbd>
            </button>
          </>
        }
      >
        <Tabs tabs={TABS} active={tab} onChange={(id) => setTab(id as InfrastructureTab)}>
          <div className="min-h-0 flex-1 overflow-auto">
            {tab === "workers" ? <WorkersTab overview={overview} now={now} /> : null}
            {tab === "sessions" ? <SessionsTab sessions={sessions} now={now} /> : null}
            {tab === "queue" ? <QueueTab overview={overview} now={now} /> : null}
            {tab === "runtimes" ? <RuntimesTab overview={overview} /> : null}
            {tab === "jobs" ? <JobsTab overview={overview} now={now} /> : null}
            {tab === "events" ? <EventsTab overview={overview} /> : null}
            {tab === "cloudflare" ? <CloudflareTab overview={overview} /> : null}
            {tab === "configuration" ? <ConfigurationTab overview={overview} /> : null}
          </div>
        </Tabs>
      </Pane>
    </div>
  );
}

function WorkersTab({
  overview,
  now,
}: {
  overview: InfrastructureOverview;
  now: number;
}) {
  if (overview.workers.length === 0) {
    return (
      <EmptyRow
        text="no lab worker registered · run tools/host/provision.sh"
        action={<span className="text-dim">docs/runbooks/lab-host.md</span>}
      />
    );
  }
  return (
    <table className="hm-table" data-testid="table-workers">
      <thead>
        <tr>
          <th>worker</th>
          <th>state</th>
          <th>host</th>
          <th>endpoint</th>
          <th>cpu</th>
          <th>mem</th>
          <th className="num">envs</th>
          <th>agent</th>
          <th>capabilities</th>
          <th>last heartbeat</th>
        </tr>
      </thead>
      <tbody>
        {overview.workers.map((worker) => (
          <tr key={worker.id}>
            <td>
              <IdBadge id={worker.id} />
            </td>
            <td>
              <StatusChip kind="connection" value={worker.status} />
            </td>
            <td className="hm-mono">{worker.hostname ?? "—"}</td>
            <td className="hm-mono text-muted">{worker.endpoint ?? "—"}</td>
            <td>
              <Bar value={worker.load.cpu_percent} /> {percent(worker.load.cpu_percent)}
            </td>
            <td>
              <Bar value={worker.load.memory_percent} />{" "}
              {percent(worker.load.memory_percent)}
            </td>
            <td className="num">{worker.active_sessions}</td>
            <td className="hm-mono">{worker.agent_version ?? "—"}</td>
            <td className="hm-mono text-muted">{worker.capabilities.join(" ")}</td>
            <td className="hm-mono text-muted">
              {worker.last_heartbeat_at} · {age(worker.last_heartbeat_at, now)} ago
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SessionsTab({
  sessions,
  now,
}: {
  sessions: InfrastructureOverview["sessions"];
  now: number;
}) {
  if (sessions.length === 0) {
    return (
      <EmptyRow
        text="no sessions"
        action={
          <span className="hm-mono text-dim">hivemind lab up linux.single --seed 1</span>
        }
      />
    );
  }
  return (
    <table className="hm-table" data-testid="table-sessions">
      <thead>
        <tr>
          <th>session</th>
          <th>archetype</th>
          <th className="num">seed</th>
          <th>class</th>
          <th>provider</th>
          <th>lifecycle</th>
          <th>nodes</th>
          <th>uptime</th>
          <th>reason</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session) => (
          <tr key={session.id}>
            <td>
              <IdBadge id={session.id} />
            </td>
            <td className="hm-mono">
              {session.archetype ?? "?"}@{session.archetype_version ?? "?"}
            </td>
            <td className="num">{session.seed ?? "—"}</td>
            <td className="hm-mono">{session.provider_class ?? "—"}</td>
            <td className="hm-mono text-muted">{session.provider_id ?? "—"}</td>
            <td>
              <StatusChip kind="lifecycle" value={session.status} />
            </td>
            <td className="hm-mono text-muted">
              {session.nodes.map((node) => node.name).join(", ") || "—"}
            </td>
            <td className="hm-mono num">
              {age(session.created_at, Date.parse(session.finished_at ?? "") || now)}
            </td>
            <td className="text-muted">{session.reason ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QueueTab({ overview, now }: { overview: InfrastructureOverview; now: number }) {
  if (overview.queue.length === 0) {
    return <EmptyRow text="queue empty" action={null} />;
  }
  return (
    <table className="hm-table" data-testid="table-queue">
      <thead>
        <tr>
          <th>job</th>
          <th>archetype</th>
          <th>class</th>
          <th>provider</th>
          <th>state</th>
          <th className="num">waiting</th>
        </tr>
      </thead>
      <tbody>
        {overview.queue.map((session) => (
          <tr key={session.id}>
            <td>
              <IdBadge id={session.id} />
            </td>
            <td className="hm-mono">{session.archetype ?? "?"}</td>
            <td className="hm-mono">{session.provider_class ?? "—"}</td>
            <td className="hm-mono text-muted">{session.provider_id ?? "—"}</td>
            <td>
              <StatusChip kind="lifecycle" value={session.status} />
            </td>
            <td className="hm-mono num">{age(session.created_at, now)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RuntimesTab({ overview }: { overview: InfrastructureOverview }) {
  return (
    <table className="hm-table" data-testid="table-runtimes">
      <thead>
        <tr>
          <th>runtime</th>
          <th>kind</th>
          <th>pinned</th>
          <th>reported</th>
          <th>state</th>
          <th>archetypes</th>
        </tr>
      </thead>
      <tbody>
        {overview.runtimes.map((row) => (
          <tr key={row.name}>
            <td className="hm-mono">{row.name}</td>
            <td className="hm-mono text-muted">{row.kind}</td>
            <td className="hm-mono break-all text-muted">{row.pinned}</td>
            <td className="hm-mono">{row.reported ?? "—"}</td>
            <td>
              <StatusChip
                kind="freshness"
                value={row.state === "ok" ? "current" : row.state}
              />
            </td>
            <td className="hm-mono text-muted">{row.archetypes.join(", ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function JobsTab({ overview, now }: { overview: InfrastructureOverview; now: number }) {
  if (overview.failures.length === 0) {
    return <EmptyRow text="no provisioning failures" action={null} />;
  }
  return (
    <table className="hm-table" data-testid="table-jobs">
      <thead>
        <tr>
          <th>session</th>
          <th>archetype</th>
          <th>provider</th>
          <th>state</th>
          <th>reason</th>
          <th className="num">when</th>
        </tr>
      </thead>
      <tbody>
        {overview.failures.map((session) => (
          <tr key={session.id}>
            <td>
              <IdBadge id={session.id} href={`/system/infrastructure?tab=events`} />
            </td>
            <td className="hm-mono">{session.archetype ?? "?"}</td>
            <td className="hm-mono text-muted">{session.provider_id ?? "—"}</td>
            <td>
              <StatusChip kind="lifecycle" value={session.status} />
            </td>
            <td className="text-danger">{session.reason ?? "—"}</td>
            <td className="hm-mono num">{age(session.updated_at, now)} ago</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EventsTab({ overview }: { overview: InfrastructureOverview }) {
  if (overview.events.length === 0) {
    return <EmptyRow text="no events" action={null} />;
  }
  return (
    <table className="hm-table" data-testid="table-events">
      <thead>
        <tr>
          <th>at</th>
          <th>session</th>
          <th className="num">seq</th>
          <th>event</th>
        </tr>
      </thead>
      <tbody>
        {overview.events.map((row) => {
          const event = row.event.event;
          const text =
            event.type === "status_changed"
              ? `${event.from} → ${event.to}${event.reason === undefined ? "" : ` (${event.reason})`}`
              : event.type === "notice"
                ? event.text
                : event.type === "log"
                  ? `[${event.level}] ${event.message}`
                  : "";
          return (
            <tr key={`${row.lab_session_id}-${row.event.sequence}`}>
              <td className="hm-mono text-muted">{row.event.at}</td>
              <td>
                <IdBadge id={row.lab_session_id} />
              </td>
              <td className="hm-mono num">{row.event.sequence}</td>
              <td
                className={`hm-mono ${event.type === "status_changed" && event.to === "failed" ? "text-danger" : ""}`}
              >
                {text}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CloudflareTab({ overview }: { overview: InfrastructureOverview }) {
  return (
    <table className="hm-table" data-testid="table-cloudflare">
      <thead>
        <tr>
          <th>component</th>
          <th>state</th>
          <th>detail</th>
          <th className="num">latency</th>
        </tr>
      </thead>
      <tbody>
        {overview.health.components.map((component) => (
          <tr key={component.component}>
            <td className="hm-mono">{component.component}</td>
            <td>
              <StatusChip kind="connection" value={component.state} />
            </td>
            <td className="text-muted">{component.detail ?? ""}</td>
            <td className="num">
              {component.latency_ms === undefined ? "—" : `${component.latency_ms} ms`}
            </td>
          </tr>
        ))}
        <tr>
          <td className="hm-mono">durable objects</td>
          <td>
            <StatusChip
              kind="connection"
              value={overview.health.ok ? "online" : "degraded"}
            />
          </td>
          <td className="text-muted">
            LabSession per session · Sandbox per node (Class A/C)
          </td>
          <td className="num">—</td>
        </tr>
        <tr>
          <td className="hm-mono">last export</td>
          <td>
            <StatusChip value={overview.last_export === null ? "pending" : "current"} />
          </td>
          <td className="hm-mono text-muted">
            {overview.last_export === null
              ? "no export yet"
              : `${overview.last_export.key} · ${overview.last_export.uploaded_at}`}
          </td>
          <td className="num">—</td>
        </tr>
      </tbody>
    </table>
  );
}

function ConfigurationTab({ overview }: { overview: InfrastructureOverview }) {
  const rows: [string, string][] = [
    ["class C preference", overview.configuration.class_c_preference.join(" → ")],
    ["sandbox enabled", String(overview.configuration.sandbox_enabled)],
    ["heartbeat interval", `${overview.configuration.heartbeat_interval_seconds}s`],
    ["orphan sweep interval", `${overview.configuration.sweep_interval_seconds}s`],
    ["worker degraded after", "45s without a heartbeat"],
    ["worker offline after", "120s without a heartbeat"],
    ["idle expiry", "2h without learner traffic"],
    ["recordings", "asciicast v2, redacted before R2, 90-day TTL unless pinned (D-019)"],
  ];
  return (
    <table className="hm-table" data-testid="table-configuration">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <td className="w-64 text-muted">{key}</td>
            <td className="hm-mono">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
