import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { ContentRepository } from "../src/db/content";
import { LearnerRepository } from "../src/db/learners";
import { splitSqlStatements } from "../src/db/sql-split";
import { ContentService } from "../src/services/content";
import { fixedClock } from "./clock";

/*
 * Restore drill, service-path half (Stage 01 acceptance 5): a `wrangler d1
 * export` file is loaded into an EMPTY database and the gold lesson is read
 * back exactly the way GET /api/lessons/{id} reads it. Runs only when
 * HIVEMIND_RESTORE_EXPORT points at an export (CI restore-drill job and the
 * runbook); otherwise it is skipped, never silently passed.
 */

const GOLD_LESSON =
  process.env["HIVEMIND_EXPECT_LESSON"] ?? "HM-LESSON-linux-networking-01";

// miniflare drops empty-string bindings, so the binding is optional.
const exportSql: string = env.TEST_RESTORE_EXPORT ?? "";

describe("restore drill", () => {
  it.skipIf(exportSql.length === 0)(
    "restores an export into a fresh database and serves the gold lesson",
    async () => {
      const statements = splitSqlStatements(exportSql).filter(
        (statement) =>
          !/^(PRAGMA|BEGIN TRANSACTION|COMMIT)/iu.test(statement) &&
          !/_cf_KV/u.test(statement),
      );
      expect(statements.length).toBeGreaterThan(20);
      for (const statement of statements) {
        await env.RESTORE_DB.prepare(statement).run();
      }
      const learners = new LearnerRepository(env.RESTORE_DB, fixedClock());
      expect((await learners.get("HM-LRN-000001"))?.display_name).toBe("Jacob");
      const content = new ContentService(
        new ContentRepository(env.RESTORE_DB, fixedClock()),
      );
      const latest = await content.latestVersion();
      expect(latest).not.toBeNull();
      const served = await content.lesson(GOLD_LESSON, { authorView: true });
      expect(served?.lesson.id).toBe(GOLD_LESSON);
      expect(served?.lesson.sections).toHaveLength(12);
      expect(served?.sources.length).toBeGreaterThan(0);
    },
  );
});
