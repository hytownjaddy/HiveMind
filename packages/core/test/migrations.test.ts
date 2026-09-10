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
const STAGE02_TABLES = ["lab_session_events", "lab_workers"];
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

async function columns(table: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{
    name: string;
  }>();
  return results.map((row) => row.name);
}

async function applyDown(sql: string): Promise<void> {
  for (const statement of statements(sql)) {
    await env.DB.prepare(statement).run();
  }
}

async function applyUp(name: string): Promise<void> {
  const up = env.TEST_MIGRATIONS.find((migration) => migration.name === name);
  expect(up).toBeDefined();
  for (const query of up?.queries ?? []) {
    await env.DB.prepare(query).run();
  }
}

describe("migration 0003", () => {
  it("adds the worker registry, session columns, and event log, and rolls back", async () => {
    expect(await tables()).toEqual([...FOUNDATION_TABLES, ...STAGE02_TABLES].sort());
    expect(await columns("lab_sessions")).toEqual(
      expect.arrayContaining([
        "provider_class",
        "worker_id",
        "topology_json",
        "nodes_json",
      ]),
    );
    await applyDown(env.TEST_DOWN_0003);
    expect(await tables()).toEqual([...FOUNDATION_TABLES].sort());
    expect(await columns("lab_sessions")).not.toContain("worker_id");
    await applyUp("0003_lab_runtime.sql");
    expect(await tables()).toEqual([...FOUNDATION_TABLES, ...STAGE02_TABLES].sort());
  });
});

describe("migration 0002", () => {
  it("creates the Stage 01 schema with the seeded learner", async () => {
    expect(await tables()).toEqual([...FOUNDATION_TABLES, ...STAGE02_TABLES].sort());
    const learner = await env.DB.prepare(
      "SELECT id, display_name, email FROM learners",
    ).first<{ id: string; display_name: string; email: string | null }>();
    expect(learner).toEqual({ id: "HM-LRN-000001", display_name: "Jacob", email: null });
  });

  it("has a down script that restores the scaffold schema, and applies again afterwards", async () => {
    await applyDown(env.TEST_DOWN_0003);
    await applyDown(env.TEST_DOWN_0002);
    expect(await tables()).toEqual([...SCAFFOLD_TABLES].sort());
    await applyUp("0002_foundation.sql");
    expect(await tables()).toEqual([...FOUNDATION_TABLES].sort());
    await applyUp("0003_lab_runtime.sql");
    expect(await tables()).toEqual([...FOUNDATION_TABLES, ...STAGE02_TABLES].sort());
  });
});
