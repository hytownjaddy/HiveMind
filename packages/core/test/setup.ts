import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach } from "vitest";

/*
 * Migrations run once per file; every test then starts from the seeded state
 * so assertions never depend on ordering. Attempts are immutable by trigger,
 * so tests that insert them use ids no other test touches.
 */

const RESETTABLE_TABLES = [
  "career_targets",
  "role_competencies",
  "competencies",
  "role_profiles",
  "review_items",
  "work_orders",
  "lab_sessions",
  "problem_instances",
  "content_claims",
  "sources",
  "skill_relationships",
  "skill_versions",
  "skills",
  "lesson_questions",
  "lessons",
  "modules",
  "course_versions",
  "courses",
  "content_versions",
  "algorithm_versions",
];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.batch([
    ...RESETTABLE_TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
    env.DB.prepare(
      "UPDATE learners SET email = NULL, access_subject = NULL WHERE id = 'HM-LRN-000001'",
    ),
  ]);
});
