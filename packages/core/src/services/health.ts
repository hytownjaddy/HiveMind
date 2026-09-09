import type { Database } from "../db/index";
import type { ExportStore } from "../storage/r2";

/*
 * Environment status for the Control Center and `GET /api/health`
 * (01-control-center.md ENVIRONMENT pane). Each component reports
 * independently so one failure never hides the others.
 */

export type ComponentState = "online" | "offline" | "degraded" | "unconfigured";

export interface ComponentHealth {
  readonly component: "d1" | "r2" | "session_worker";
  readonly state: ComponentState;
  readonly detail?: string | undefined;
  readonly latency_ms?: number | undefined;
}

export interface HealthReport {
  readonly ok: boolean;
  readonly checked_at: string;
  readonly version: string;
  readonly environment: string;
  readonly components: readonly ComponentHealth[];
  readonly runtime_versions: Readonly<Record<string, string>>;
}

export interface HealthDeps {
  readonly db: Database;
  readonly exports?: ExportStore | undefined;
  /** Service binding to the session Worker; called with a string URL so it works under the dev platform proxy too. */
  readonly sessionWorker?:
    { fetch(input: string, init?: RequestInit): Promise<Response> } | undefined;
  readonly version: string;
  readonly environment: string;
  readonly runtimeVersions: Readonly<Record<string, string>>;
  readonly now: () => string;
}

async function timed(
  run: () => Promise<void>,
): Promise<{ state: ComponentState; detail?: string; latency_ms: number }> {
  const started = Date.now();
  try {
    await run();
    return { state: "online", latency_ms: Date.now() - started };
  } catch (error) {
    return {
      state: "offline",
      detail: error instanceof Error ? error.message : String(error),
      latency_ms: Date.now() - started,
    };
  }
}

export class HealthService {
  constructor(private readonly deps: HealthDeps) {}

  async report(): Promise<HealthReport> {
    const components: ComponentHealth[] = [];
    const d1 = await timed(async () => {
      await this.deps.db.prepare("SELECT 1 AS ok").first();
    });
    components.push({ component: "d1", ...d1 });
    if (this.deps.exports === undefined) {
      components.push({ component: "r2", state: "unconfigured" });
    } else {
      const store = this.deps.exports;
      components.push({
        component: "r2",
        ...(await timed(async () => void (await store.list(undefined, 1)))),
      });
    }
    if (this.deps.sessionWorker === undefined) {
      components.push({ component: "session_worker", state: "unconfigured" });
    } else {
      const worker = this.deps.sessionWorker;
      components.push({
        component: "session_worker",
        ...(await timed(async () => {
          const response = await worker.fetch(
            "https://hivemind-web.internal/session/health",
            {
              headers: { origin: "https://hivemind-web.internal" },
            },
          );
          if (!response.ok) {
            throw new Error(`session worker responded ${response.status}`);
          }
        })),
      });
    }
    return {
      ok: components.every(
        (component) => component.state === "online" || component.state === "unconfigured",
      ),
      checked_at: this.deps.now(),
      version: this.deps.version,
      environment: this.deps.environment,
      components,
      runtime_versions: this.deps.runtimeVersions,
    };
  }
}
