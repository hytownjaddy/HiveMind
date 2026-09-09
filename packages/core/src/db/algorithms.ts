import { z } from "zod";

import { allRows, type Clock, type Database } from "./index";

/** Versioned learner-model algorithms (D-014); Stage 06 registers real ones. */
export const algorithmVersionSchema = z.strictObject({
  id: z.string().min(1),
  version: z.string().min(1),
  kind: z.enum(["mastery", "difficulty", "retention", "readiness"]),
  description: z.string().min(1),
  active: z.boolean(),
  created_at: z.string(),
});
export type AlgorithmVersion = z.infer<typeof algorithmVersionSchema>;

export class AlgorithmRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async register(entry: Omit<AlgorithmVersion, "created_at">): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO algorithm_versions (id, version, kind, description, active, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id, version) DO UPDATE SET active = excluded.active, description = excluded.description",
      )
      .bind(
        entry.id,
        entry.version,
        entry.kind,
        entry.description,
        entry.active ? 1 : 0,
        this.clock.now(),
      )
      .run();
  }

  async list(): Promise<AlgorithmVersion[]> {
    const rows = await allRows<{
      id: string;
      version: string;
      kind: string;
      description: string;
      active: number;
      created_at: string;
    }>(
      this.db.prepare(
        "SELECT id, version, kind, description, active, created_at FROM algorithm_versions ORDER BY id, version",
      ),
    );
    return rows.map((row) =>
      algorithmVersionSchema.parse({ ...row, active: row.active === 1 }),
    );
  }
}
