import {
  careerProfileSchema,
  competencySchema,
  roleProfileSchema,
  type CareerProfile,
  type Competency,
  type RoleProfile,
} from "@hivemind/schema";

import { allRows, parseJsonColumn, type Clock, type Database } from "./index";

export class CareerRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async upsertRoleProfile(profile: RoleProfile): Promise<void> {
    const parsed = roleProfileSchema.parse(profile);
    const statements = [
      this.db
        .prepare(
          "INSERT INTO role_profiles (id, version, title, company, family, level, status, profile_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, version) DO UPDATE SET title = excluded.title, company = excluded.company, family = excluded.family, level = excluded.level, status = excluded.status, profile_json = excluded.profile_json",
        )
        .bind(
          parsed.id,
          parsed.version,
          parsed.title,
          parsed.company ?? null,
          parsed.family,
          parsed.level,
          parsed.status,
          JSON.stringify(parsed),
          this.clock.now(),
        ),
      this.db
        .prepare(
          "DELETE FROM role_competencies WHERE role_profile_id = ? AND role_profile_version = ?",
        )
        .bind(parsed.id, parsed.version),
      ...parsed.competencies.map((competency) =>
        this.db
          .prepare(
            "INSERT INTO role_competencies (role_profile_id, role_profile_version, competency_id, weight, required, min_readiness) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(
            parsed.id,
            parsed.version,
            competency.competency_id,
            competency.weight,
            competency.required ? 1 : 0,
            competency.min_readiness ?? null,
          ),
      ),
    ];
    await this.db.batch(statements);
  }

  async upsertCompetency(competency: Competency): Promise<void> {
    const parsed = competencySchema.parse(competency);
    await this.db
      .prepare(
        "INSERT INTO competencies (id, version, name, category, status, competency_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id, version) DO UPDATE SET name = excluded.name, category = excluded.category, status = excluded.status, competency_json = excluded.competency_json",
      )
      .bind(
        parsed.id,
        parsed.version,
        parsed.name,
        parsed.category,
        parsed.status,
        JSON.stringify(parsed),
        this.clock.now(),
      )
      .run();
  }

  async listRoleProfiles(): Promise<RoleProfile[]> {
    const rows = await allRows<{ profile_json: string }>(
      this.db.prepare("SELECT profile_json FROM role_profiles ORDER BY id, version"),
    );
    return rows.map((row) =>
      parseJsonColumn(row.profile_json, (v) => roleProfileSchema.parse(v)),
    );
  }

  async activeTarget(learnerId: string): Promise<CareerProfile | null> {
    const row = await this.db
      .prepare(
        "SELECT learner_id, role_profile_id, role_profile_version, active, set_at, notes FROM career_targets WHERE learner_id = ? AND active = 1 LIMIT 1",
      )
      .bind(learnerId)
      .first<{
        learner_id: string;
        role_profile_id: string;
        role_profile_version: string;
        active: number;
        set_at: string;
        notes: string | null;
      }>();
    if (row === null) {
      return null;
    }
    return careerProfileSchema.parse({
      learner_id: row.learner_id,
      role_profile_id: row.role_profile_id,
      role_profile_version: row.role_profile_version,
      active: row.active === 1,
      set_at: row.set_at,
      ...(row.notes === null ? {} : { notes: row.notes }),
    });
  }

  async setTarget(profile: CareerProfile): Promise<void> {
    const parsed = careerProfileSchema.parse(profile);
    await this.db.batch([
      this.db
        .prepare("UPDATE career_targets SET active = 0 WHERE learner_id = ?")
        .bind(parsed.learner_id),
      this.db
        .prepare(
          "INSERT INTO career_targets (learner_id, role_profile_id, role_profile_version, active, set_at, notes) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(learner_id, role_profile_id, role_profile_version) DO UPDATE SET active = excluded.active, set_at = excluded.set_at, notes = excluded.notes",
        )
        .bind(
          parsed.learner_id,
          parsed.role_profile_id,
          parsed.role_profile_version,
          parsed.active ? 1 : 0,
          parsed.set_at,
          parsed.notes ?? null,
        ),
    ]);
  }
}
