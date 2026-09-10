import {
  executionClassSchema,
  formatLabSessionId,
  labStatusSchema,
  sessionNodeSchema,
  topologyInstanceSchema,
  type Capability,
  type ExecutionClass,
  type LabStatus,
  type TopologyInstance,
} from "@hivemind/schema";
import { z } from "zod";

import { allRows, nextSequence, type Clock, type Database } from "./index";

/*
 * Cross-session index of lab sessions (D-030). Live state lives in the
 * LabSession Durable Object; this table allocates ids, answers "recent labs",
 * feeds the Infrastructure console, and lets reconciliation find what should
 * exist on a worker.
 */

export const labSessionIndexSchema = z.strictObject({
  id: z.string(),
  learner_id: z.string(),
  problem_instance_id: z.string().nullable(),
  provider_id: z.string().nullable(),
  provider_class: executionClassSchema.nullable(),
  worker_id: z.string().nullable(),
  archetype: z.string().nullable(),
  archetype_version: z.string().nullable(),
  seed: z.int().nullable(),
  requires: z.array(z.string()),
  nodes: z.array(sessionNodeSchema),
  recording_keys: z.record(z.string(), z.string()),
  status: labStatusSchema,
  reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  expires_at: z.string().nullable(),
  hard_ttl_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});
export type LabSessionIndex = z.infer<typeof labSessionIndexSchema>;

interface LabSessionRow {
  id: string;
  learner_id: string;
  problem_instance_id: string | null;
  provider_id: string | null;
  provider_class: string | null;
  worker_id: string | null;
  archetype: string | null;
  archetype_version: string | null;
  seed: number | null;
  requires_json: string;
  nodes_json: string | null;
  recording_keys_json: string | null;
  topology_json: string | null;
  status: LabStatus;
  reason: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  hard_ttl_at: string | null;
  finished_at: string | null;
}

const COLUMNS =
  "id, learner_id, problem_instance_id, provider_id, provider_class, worker_id, archetype, archetype_version, seed, requires_json, nodes_json, recording_keys_json, topology_json, status, reason, created_at, updated_at, expires_at, hard_ttl_at, finished_at";

function toIndex(row: LabSessionRow): LabSessionIndex {
  return labSessionIndexSchema.parse({
    id: row.id,
    learner_id: row.learner_id,
    problem_instance_id: row.problem_instance_id,
    provider_id: row.provider_id,
    provider_class: row.provider_class,
    worker_id: row.worker_id,
    archetype: row.archetype,
    archetype_version: row.archetype_version,
    seed: row.seed,
    requires: JSON.parse(row.requires_json) as string[],
    nodes: row.nodes_json === null ? [] : (JSON.parse(row.nodes_json) as unknown),
    recording_keys:
      row.recording_keys_json === null
        ? {}
        : (JSON.parse(row.recording_keys_json) as unknown),
    status: row.status,
    reason: row.reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    expires_at: row.expires_at,
    hard_ttl_at: row.hard_ttl_at,
    finished_at: row.finished_at,
  });
}

export interface LabSessionCreate {
  readonly id: string;
  readonly learner_id: string;
  readonly requires: readonly Capability[];
  readonly status: LabStatus;
  readonly archetype: string;
  readonly archetype_version: string;
  readonly seed: number;
  readonly topology: TopologyInstance;
  readonly problem_instance_id?: string | null;
  readonly expires_at?: string | null;
  readonly hard_ttl_at?: string | null;
}

export interface LabSessionPatch {
  readonly status?: LabStatus;
  readonly provider_id?: string | null;
  readonly provider_class?: ExecutionClass | null;
  readonly worker_id?: string | null;
  readonly nodes?: readonly z.infer<typeof sessionNodeSchema>[];
  readonly recording_keys?: Readonly<Record<string, string>>;
  readonly reason?: string | null;
  readonly expires_at?: string | null;
  readonly finished_at?: string | null;
}

export class LabSessionIndexRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /** Next `HM-LAB-nnnnnn` from the index (D-038; the gateway no longer mints random ids). */
  async allocateId(): Promise<string> {
    return formatLabSessionId(await nextSequence(this.db, "lab_sessions"));
  }

  async create(entry: LabSessionCreate): Promise<LabSessionIndex> {
    const now = this.clock.now();
    await this.db
      .prepare(
        "INSERT INTO lab_sessions (id, learner_id, problem_instance_id, provider_id, requires_json, status, created_at, updated_at, expires_at, archetype, archetype_version, seed, topology_json, nodes_json, hard_ttl_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        entry.id,
        entry.learner_id,
        entry.problem_instance_id ?? null,
        JSON.stringify(entry.requires),
        entry.status,
        now,
        now,
        entry.expires_at ?? null,
        entry.archetype,
        entry.archetype_version,
        entry.seed,
        JSON.stringify(topologyInstanceSchema.parse(entry.topology)),
        JSON.stringify(
          entry.topology.lab_spec.nodes.map((n) => ({ name: n.name, role: n.role })),
        ),
        entry.hard_ttl_at ?? null,
      )
      .run();
    const created = await this.get(entry.id);
    if (created === null) {
      throw new Error(`lab session ${entry.id} vanished after insert`);
    }
    return created;
  }

  async update(id: string, patch: LabSessionPatch): Promise<void> {
    const sets: string[] = ["updated_at = ?"];
    const values: (string | number | null)[] = [this.clock.now()];
    const add = (column: string, value: string | number | null): void => {
      sets.push(`${column} = ?`);
      values.push(value);
    };
    if (patch.status !== undefined) add("status", patch.status);
    if (patch.provider_id !== undefined) add("provider_id", patch.provider_id);
    if (patch.provider_class !== undefined) add("provider_class", patch.provider_class);
    if (patch.worker_id !== undefined) add("worker_id", patch.worker_id);
    if (patch.nodes !== undefined) add("nodes_json", JSON.stringify(patch.nodes));
    if (patch.recording_keys !== undefined) {
      add("recording_keys_json", JSON.stringify(patch.recording_keys));
    }
    if (patch.reason !== undefined) add("reason", patch.reason);
    if (patch.expires_at !== undefined) add("expires_at", patch.expires_at);
    if (patch.finished_at !== undefined) add("finished_at", patch.finished_at);
    await this.db
      .prepare(`UPDATE lab_sessions SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }

  async get(id: string): Promise<LabSessionIndex | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM lab_sessions WHERE id = ?`)
      .bind(id)
      .first<LabSessionRow>();
    return row === null ? null : toIndex(row);
  }

  async topology(id: string): Promise<TopologyInstance | null> {
    const row = await this.db
      .prepare("SELECT topology_json FROM lab_sessions WHERE id = ?")
      .bind(id)
      .first<{ topology_json: string | null }>();
    return row === null || row.topology_json === null
      ? null
      : topologyInstanceSchema.parse(JSON.parse(row.topology_json));
  }

  async listRecent(learnerId: string, limit = 8): Promise<LabSessionIndex[]> {
    const rows = await allRows<LabSessionRow>(
      this.db
        .prepare(
          `SELECT ${COLUMNS} FROM lab_sessions WHERE learner_id = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .bind(learnerId, limit),
    );
    return rows.map(toIndex);
  }

  /** Every session not yet in a final state, newest first (Infrastructure console). */
  async listActive(limit = 100): Promise<LabSessionIndex[]> {
    const rows = await allRows<LabSessionRow>(
      this.db
        .prepare(
          `SELECT ${COLUMNS} FROM lab_sessions WHERE status NOT IN ('destroyed', 'failed') ORDER BY updated_at DESC LIMIT ?`,
        )
        .bind(limit),
    );
    return rows.map(toIndex);
  }

  async listAll(limit = 100): Promise<LabSessionIndex[]> {
    const rows = await allRows<LabSessionRow>(
      this.db
        .prepare(`SELECT ${COLUMNS} FROM lab_sessions ORDER BY updated_at DESC LIMIT ?`)
        .bind(limit),
    );
    return rows.map(toIndex);
  }

  /** Sessions the objects still expect on a worker (reconciliation, acceptance 7). */
  async listExpectedOnWorker(workerId: string): Promise<LabSessionIndex[]> {
    const rows = await allRows<LabSessionRow>(
      this.db
        .prepare(
          `SELECT ${COLUMNS} FROM lab_sessions WHERE worker_id = ? AND status NOT IN ('destroyed', 'failed') ORDER BY created_at ASC`,
        )
        .bind(workerId),
    );
    return rows.map(toIndex);
  }
}
