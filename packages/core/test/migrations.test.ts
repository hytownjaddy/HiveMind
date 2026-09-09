import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const SCAFFOLD_TABLES = [
  "attempts",
  "courses",
  "lab_sessions",
  "skill_mastery",
  "skill_relationships",
  "skills",
  "users",
];
const FOUNDATION_TABLES = [
  "algorithm_versions",
  "attempts",
  "career_targets",
  "competencies",
  "content_claims",
  "content_versions",
  "course_versions",
  "courses",
  "lab_sessions",
  "learners",
  "lesson_questions",
  "lessons",
  "modules",
  "problem_instances",
  "review_items",
  "role_competencies",
  "role_profiles",
  "skill_relationships",
  "skill_versions",
  "skills",
  "sources",
  "work_orders",
];

async function tables(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name",
  ).all<{ name: string }>();
  return results.map((row) => row.name);
}

/** The down script has no triggers, so splitting on `;` is exact (wrangler does the same for `d1 execute --file`). */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

describe("migration 0002", () => {
  it("creates the Stage 01 schema with the seeded learner", async () => {
    expect(await tables()).toEqual([...FOUNDATION_TABLES].sort());
    const learner = await env.DB.prepare(
      "SELECT id, display_name, email FROM learners",
    ).first<{ id: string; display_name: string; email: string | null }>();
    expect(learner).toEqual({ id: "HM-LRN-000001", display_name: "Jacob", email: null });
  });

  it("has a down script that restores the scaffold schema, and applies again afterwards", async () => {
    for (const statement of statements(env.TEST_DOWN_0002)) {
      await env.DB.prepare(statement).run();
    }
    expect(await tables()).toEqual([...SCAFFOLD_TABLES].sort());
    const up = env.TEST_MIGRATIONS.find(
      (migration) => migration.name === "0002_foundation.sql",
    );
    expect(up).toBeDefined();
    for (const query of up?.queries ?? []) {
      await env.DB.prepare(query).run();
    }
    expect(await tables()).toEqual([...FOUNDATION_TABLES].sort());
  });
});
