import {
  attemptResultSchema,
  attemptSchema,
  type Attempt,
  type AttemptResult,
} from "@hivemind/schema";

import { allRows, parseJsonColumn, type Database } from "./index";

/*
 * Attempts are append-only (invariant 9). The repository exposes insert,
 * a single write of the result, and reads; there is no update or delete, and
 * the D1 triggers in migration 0002 reject anything else.
 */

export interface AttemptRow {
  readonly attempt: Attempt;
  readonly result: AttemptResult | null;
}

export class AttemptRepository {
  constructor(private readonly db: Database) {}

  async insert(attempt: Attempt): Promise<void> {
    const parsed = attemptSchema.parse(attempt);
    await this.db
      .prepare(
        "INSERT INTO attempts (id, learner_id, mode, lesson_id, problem_instance_id, lab_session_id, status, started_at, finished_at, attempt_json, result_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
      )
      .bind(
        parsed.id,
        parsed.learner_id,
        parsed.mode,
        parsed.lesson_id ?? null,
        parsed.problem_instance_id ?? null,
        parsed.lab_session_id ?? null,
        parsed.status,
        parsed.started_at,
        parsed.finished_at ?? null,
        JSON.stringify(parsed),
      )
      .run();
  }

  /** Record the result exactly once; a second call is rejected by the trigger. */
  async recordResult(result: AttemptResult, finishedAt: string): Promise<void> {
    const parsed = attemptResultSchema.parse(result);
    const outcome = await this.db
      .prepare(
        "UPDATE attempts SET result_json = ?, status = 'graded', finished_at = ? WHERE id = ? AND result_json IS NULL",
      )
      .bind(JSON.stringify(parsed), finishedAt, parsed.attempt_id)
      .run();
    if (outcome.meta.changes !== 1) {
      throw new Error(`attempt ${parsed.attempt_id} has no pending result slot`);
    }
  }

  async get(id: string): Promise<AttemptRow | null> {
    const row = await this.db
      .prepare("SELECT attempt_json, result_json FROM attempts WHERE id = ?")
      .bind(id)
      .first<{ attempt_json: string; result_json: string | null }>();
    return row === null ? null : toRow(row);
  }

  async listByLearner(learnerId: string, limit = 50): Promise<AttemptRow[]> {
    const rows = await allRows<{ attempt_json: string; result_json: string | null }>(
      this.db
        .prepare(
          "SELECT attempt_json, result_json FROM attempts WHERE learner_id = ? ORDER BY started_at DESC LIMIT ?",
        )
        .bind(learnerId, limit),
    );
    return rows.map(toRow);
  }
}

function toRow(row: { attempt_json: string; result_json: string | null }): AttemptRow {
  return {
    attempt: parseJsonColumn(row.attempt_json, (v) => attemptSchema.parse(v)),
    result:
      row.result_json === null
        ? null
        : parseJsonColumn(row.result_json, (v) => attemptResultSchema.parse(v)),
  };
}
