import type { LabWorker } from "@hivemind/schema";

import type {
  LabSessionEventRepository,
  LabSessionEventRow,
} from "../db/lab-session-events";
import type { LabSessionIndex, LabSessionIndexRepository } from "../db/lab-sessions";
import type { LabWorkerRepository } from "../db/lab-workers";
import type { ArchetypeRegistry } from "../labs/archetypes";
import { CLASS_C_PREFERENCE } from "../labs/selection";
import type { StoredExport } from "../storage/r2";
import type { HealthReport } from "./health";

/*
 * Infrastructure console data (docs/mockups/18-infrastructure-console.md):
 * the worker registry with heartbeats, the session index by provider class,
 * the runtime pins with update flags, provisioning failures, the durable
 * event log, and the Cloudflare health probes. Pure assembly over
 * repositories; the console renders it.
 */

/** Versions the host provisioning script pins (tools/host/provision.sh). */
export const PINNED_RUNTIMES: Readonly<Record<string, string>> = {
  containerlab: "0.79.0",
  frr: "10.7.1",
  agent: "0.2.0",
};

export type RuntimeState = "ok" | "update_available" | "failed";

export interface RuntimeRow {
  readonly name: string;
  readonly kind: "image" | "tool";
  /** Pinned reference (image with digest, or version). */
  readonly pinned: string;
  /** What the worker reports running, when it reports it. */
  readonly reported: string | null;
  readonly state: RuntimeState;
  readonly archetypes: readonly string[];
}

export interface InfrastructureOverview {
  readonly checked_at: string;
  readonly overall: "online" | "degraded" | "offline";
  readonly workers: readonly LabWorker[];
  readonly workers_online: number;
  readonly sessions: readonly LabSessionIndex[];
  readonly running_by_class: Readonly<Record<"A" | "B" | "C", number>>;
  readonly sandbox_sessions: number;
  readonly queue: readonly LabSessionIndex[];
  readonly failures: readonly LabSessionIndex[];
  readonly runtimes: readonly RuntimeRow[];
  readonly events: readonly LabSessionEventRow[];
  readonly health: HealthReport;
  readonly last_export: StoredExport | null;
  readonly configuration: {
    readonly class_c_preference: readonly string[];
    readonly sandbox_enabled: boolean;
    readonly heartbeat_interval_seconds: number;
    readonly sweep_interval_seconds: number;
  };
}

export interface LabHostSummary {
  readonly state: "online" | "degraded" | "offline";
  readonly detail: string;
  readonly cpu_percent: number | null;
  readonly memory_percent: number | null;
  readonly environments: number;
}

export interface InfrastructureDeps {
  readonly workers: LabWorkerRepository;
  readonly sessions: LabSessionIndexRepository;
  readonly events: LabSessionEventRepository;
  readonly archetypes: ArchetypeRegistry;
  readonly health: () => Promise<HealthReport>;
  readonly lastExport: () => Promise<StoredExport | null>;
  readonly sandboxEnabled: boolean;
  readonly now: () => string;
}

const HEARTBEAT_INTERVAL_SECONDS = 15;
const SWEEP_INTERVAL_SECONDS = 60;
const ACTIVE = new Set([
  "ready",
  "active",
  "grading",
  "baseline_check",
  "fault_injection",
  "fault_check",
]);
const QUEUED = new Set(["queued", "provisioning"]);

function imageVersion(reference: string): string {
  const tag = reference.split("@")[0]?.split(":").at(-1) ?? reference;
  return tag;
}

export class InfrastructureService {
  constructor(private readonly deps: InfrastructureDeps) {}

  runtimes(workers: readonly LabWorker[]): RuntimeRow[] {
    const reported = new Map<string, string>();
    for (const worker of workers) {
      for (const [name, version] of Object.entries(worker.runtime_versions)) {
        reported.set(name, version);
      }
    }
    const rows: RuntimeRow[] = [];
    const images = new Map<string, string[]>();
    for (const row of this.deps.archetypes.images()) {
      const list = images.get(row.image) ?? [];
      list.push(row.archetype_id);
      images.set(row.image, list);
    }
    for (const [image, archetypes] of images) {
      const name = image.split("@")[0]?.split(":")[0]?.split("/").at(-1) ?? image;
      const pinnedVersion = imageVersion(image);
      const actual = reported.get(name) ?? null;
      rows.push({
        name,
        kind: "image",
        pinned: image,
        reported: actual,
        state: actual === null || actual === pinnedVersion ? "ok" : "update_available",
        archetypes: [...new Set(archetypes)].sort(),
      });
    }
    for (const [name, pinned] of Object.entries(PINNED_RUNTIMES)) {
      if (rows.some((row) => row.name === name)) {
        continue;
      }
      const actual = reported.get(name) ?? null;
      rows.push({
        name,
        kind: "tool",
        pinned,
        reported: actual,
        state: actual === null || actual === pinned ? "ok" : "update_available",
        archetypes: [],
      });
    }
    if (reported.has("docker")) {
      rows.push({
        name: "docker",
        kind: "tool",
        pinned: "host package",
        reported: reported.get("docker") ?? null,
        state: "ok",
        archetypes: [],
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async overview(): Promise<InfrastructureOverview> {
    const [workers, sessions, events, health, lastExport] = await Promise.all([
      this.deps.workers.list(),
      this.deps.sessions.listAll(200),
      this.deps.events.listRecent(100),
      this.deps.health(),
      this.deps.lastExport(),
    ]);
    const running = sessions.filter((session) => ACTIVE.has(session.status));
    const byClass = { A: 0, B: 0, C: 0 };
    for (const session of running) {
      if (session.provider_class !== null) {
        byClass[session.provider_class] += 1;
      }
    }
    const workersOnline = workers.filter((worker) => worker.status === "online").length;
    const overall: InfrastructureOverview["overall"] = !health.ok
      ? "degraded"
      : workers.length === 0 && !this.deps.sandboxEnabled
        ? "offline"
        : workers.some((worker) => worker.status !== "online")
          ? "degraded"
          : "online";
    return {
      checked_at: this.deps.now(),
      overall,
      workers,
      workers_online: workersOnline,
      sessions,
      running_by_class: byClass,
      sandbox_sessions: running.filter(
        (session) => session.provider_id === "cloudflare-sandbox",
      ).length,
      queue: sessions.filter((session) => QUEUED.has(session.status)),
      failures: sessions.filter((session) => session.status === "failed"),
      runtimes: this.runtimes(workers),
      events,
      health,
      last_export: lastExport,
      configuration: {
        class_c_preference: CLASS_C_PREFERENCE,
        sandbox_enabled: this.deps.sandboxEnabled,
        heartbeat_interval_seconds: HEARTBEAT_INTERVAL_SECONDS,
        sweep_interval_seconds: SWEEP_INTERVAL_SECONDS,
      },
    };
  }

  /** The sidebar widget: the first registered worker, or the Sandbox when that is all there is. */
  async labHost(): Promise<LabHostSummary> {
    const workers = await this.deps.workers.list();
    const [first] = workers;
    if (first === undefined) {
      return {
        state: "offline",
        detail: this.deps.sandboxEnabled
          ? "no lab worker · sandbox only"
          : "no lab worker registered · run tools/host/provision.sh",
        cpu_percent: null,
        memory_percent: null,
        environments: 0,
      };
    }
    return {
      state: first.status,
      detail: `${first.id} · ${first.hostname ?? "?"} · heartbeat ${first.last_heartbeat_at}`,
      cpu_percent: first.load.cpu_percent,
      memory_percent: first.load.memory_percent,
      environments: workers.reduce((sum, worker) => sum + worker.active_sessions, 0),
    };
  }
}
