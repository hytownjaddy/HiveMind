import {
  labWorkerSchema,
  type Capability,
  type LabWorker,
  type LabWorkerStatus,
} from "@hivemind/schema";

import { allRows, type Clock, type Database } from "./index";

/*
 * Lab worker registry (Stage 02). Workers register by heartbeat; status is
 * derived from the heartbeat age at read time so a dead worker shows as
 * offline without anyone writing to the row.
 */

export const HEARTBEAT_INTERVAL_SECONDS = 15;
/** Missed windows before `degraded` and `offline`. */
export const DEGRADED_AFTER_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 3;
export const OFFLINE_AFTER_SECONDS = HEARTBEAT_INTERVAL_SECONDS * 8;

export function workerStatusAt(lastHeartbeatAt: string, now: string): LabWorkerStatus {
  const age = (Date.parse(now) - Date.parse(lastHeartbeatAt)) / 1000;
  if (age < DEGRADED_AFTER_SECONDS) {
    return "online";
  }
  return age < OFFLINE_AFTER_SECONDS ? "degraded" : "offline";
}

export interface HeartbeatInput {
  readonly worker_id: string;
  readonly capabilities: readonly Capability[];
  readonly active_sessions: number;
  readonly load: { readonly cpu_percent: number; readonly memory_percent: number };
  readonly runtime_versions: Readonly<Record<string, string>>;
  readonly at: string;
  readonly endpoint?: string | undefined;
  readonly agent_version?: string | undefined;
  readonly hostname?: string | undefined;
}

interface WorkerRow {
  id: string;
  capabilities_json: string;
  endpoint: string | null;
  agent_version: string | null;
  hostname: string | null;
  runtime_versions_json: string;
  load_json: string;
  active_sessions: number;
  registered_at: string;
  last_heartbeat_at: string;
}

const COLUMNS =
  "id, capabilities_json, endpoint, agent_version, hostname, runtime_versions_json, load_json, active_sessions, registered_at, last_heartbeat_at";

export class LabWorkerRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  private toWorker(row: WorkerRow, now: string): LabWorker {
    return labWorkerSchema.parse({
      id: row.id,
      status: workerStatusAt(row.last_heartbeat_at, now),
      capabilities: JSON.parse(row.capabilities_json) as unknown,
      endpoint: row.endpoint,
      agent_version: row.agent_version,
      hostname: row.hostname,
      runtime_versions: JSON.parse(row.runtime_versions_json) as unknown,
      load: JSON.parse(row.load_json) as unknown,
      active_sessions: row.active_sessions,
      registered_at: row.registered_at,
      last_heartbeat_at: row.last_heartbeat_at,
    });
  }

  async heartbeat(input: HeartbeatInput): Promise<LabWorker> {
    await this.db
      .prepare(
        `INSERT INTO lab_workers (id, status, capabilities_json, endpoint, agent_version, hostname, runtime_versions_json, load_json, active_sessions, registered_at, last_heartbeat_at)
         VALUES (?, 'online', ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = 'online',
           capabilities_json = excluded.capabilities_json,
           endpoint = COALESCE(excluded.endpoint, lab_workers.endpoint),
           agent_version = COALESCE(excluded.agent_version, lab_workers.agent_version),
           hostname = COALESCE(excluded.hostname, lab_workers.hostname),
           runtime_versions_json = excluded.runtime_versions_json,
           load_json = excluded.load_json,
           active_sessions = excluded.active_sessions,
           last_heartbeat_at = excluded.last_heartbeat_at`,
      )
      .bind(
        input.worker_id,
        JSON.stringify(input.capabilities),
        input.endpoint ?? null,
        input.agent_version ?? null,
        input.hostname ?? null,
        JSON.stringify(input.runtime_versions),
        JSON.stringify(input.load),
        input.active_sessions,
        input.at,
        input.at,
      )
      .run();
    const worker = await this.get(input.worker_id);
    if (worker === null) {
      throw new Error(`worker ${input.worker_id} vanished after heartbeat`);
    }
    return worker;
  }

  async get(id: string): Promise<LabWorker | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM lab_workers WHERE id = ?`)
      .bind(id)
      .first<WorkerRow>();
    return row === null ? null : this.toWorker(row, this.clock.now());
  }

  async list(): Promise<LabWorker[]> {
    const now = this.clock.now();
    const rows = await allRows<WorkerRow>(
      this.db.prepare(`SELECT ${COLUMNS} FROM lab_workers ORDER BY id ASC`),
    );
    return rows.map((row) => this.toWorker(row, now));
  }

  async remove(id: string): Promise<void> {
    await this.db.prepare("DELETE FROM lab_workers WHERE id = ?").bind(id).run();
  }
}
