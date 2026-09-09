import { labStatusSchema, type Capability, type LabStatus } from "@hivemind/schema";
import { z } from "zod";

import { allRows, type Clock, type Database } from "./index";

/*
 * Cross-session index of lab sessions (D-030). Live state lives in the
 * LabSession Durable Object; this table answers "recent labs" and reporting.
 */

export const labSessionIndexSchema = z.strictObject({
  id: z.string(),
  learner_id: z.string(),
  problem_instance_id: z.string().nullable(),
  provider_id: z.string().nullable(),
  requires: z.array(z.string()),
  status: labStatusSchema,
  created_at: z.string(),
  updated_at: z.string(),
  expires_at: z.string().nullable(),
});
export type LabSessionIndex = z.infer<typeof labSessionIndexSchema>;

interface LabSessionRow {
  id: string;
  learner_id: string;
  problem_instance_id: string | null;
  provider_id: string | null;
  requires_json: string;
  status: LabStatus;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

export class LabSessionIndexRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async upsert(entry: {
    id: string;
    learner_id: string;
    requires: readonly Capability[];
    status: LabStatus;
    problem_instance_id?: string | null;
    provider_id?: string | null;
    expires_at?: string | null;
  }): Promise<void> {
    const now = this.clock.now();
    await this.db
      .prepare(
        "INSERT INTO lab_sessions (id, learner_id, problem_instance_id, provider_id, requires_json, status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, provider_id = excluded.provider_id, updated_at = excluded.updated_at, expires_at = excluded.expires_at",
      )
      .bind(
        entry.id,
        entry.learner_id,
        entry.problem_instance_id ?? null,
        entry.provider_id ?? null,
        JSON.stringify(entry.requires),
        entry.status,
        now,
        now,
        entry.expires_at ?? null,
      )
      .run();
  }

  async listRecent(learnerId: string, limit = 8): Promise<LabSessionIndex[]> {
    const rows = await allRows<LabSessionRow>(
      this.db
        .prepare(
          "SELECT * FROM lab_sessions WHERE learner_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .bind(learnerId, limit),
    );
    return rows.map((row) =>
      labSessionIndexSchema.parse({
        id: row.id,
        learner_id: row.learner_id,
        problem_instance_id: row.problem_instance_id,
        provider_id: row.provider_id,
        requires: JSON.parse(row.requires_json) as string[],
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        expires_at: row.expires_at,
      }),
    );
  }
}
