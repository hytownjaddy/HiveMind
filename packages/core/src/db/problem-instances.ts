import { problemInstanceSchema, type ProblemInstance } from "@hivemind/schema";

import { parseJsonColumn, type Database } from "./index";

/** Seeded, validated problem instances (invariant 5); Stage 03 fills them in. */
export class ProblemInstanceRepository {
  constructor(private readonly db: Database) {}

  async insert(instance: ProblemInstance): Promise<void> {
    const parsed = problemInstanceSchema.parse(instance);
    await this.db
      .prepare(
        "INSERT INTO problem_instances (id, problem_id, problem_version, seed, spec_hash, validation, instance_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        parsed.id,
        parsed.problem_id,
        parsed.problem_version,
        parsed.seed,
        parsed.spec_hash,
        parsed.validation,
        JSON.stringify(parsed),
        parsed.created_at,
      )
      .run();
  }

  async get(id: string): Promise<ProblemInstance | null> {
    const row = await this.db
      .prepare("SELECT instance_json FROM problem_instances WHERE id = ?")
      .bind(id)
      .first<{ instance_json: string }>();
    return row === null
      ? null
      : parseJsonColumn(row.instance_json, (v) => problemInstanceSchema.parse(v));
  }
}
