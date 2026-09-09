import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { AttemptRepository } from "../src/db/attempts";
import { ContentRepository } from "../src/db/content";
import { LearnerRepository } from "../src/db/learners";
import { WorkOrderRepository } from "../src/db/work-orders";
import { ExportService } from "../src/services/export";
import { HealthService } from "../src/services/health";
import { ExportStore } from "../src/storage/r2";
import { fixedClock } from "./clock";

describe("health", () => {
  it("reports each component independently", async () => {
    const report = await new HealthService({
      db: env.DB,
      exports: new ExportStore(env.EXPORTS),
      sessionWorker: { fetch: async () => new Response("down", { status: 503 }) },
      version: "0.1.0",
      environment: "test",
      runtimeVersions: { frr: "10.2.1" },
      now: () => "2026-09-09T12:00:00Z",
    }).report();
    expect(report.ok).toBe(false);
    expect(
      report.components.map((component) => [component.component, component.state]),
    ).toEqual([
      ["d1", "online"],
      ["r2", "online"],
      ["session_worker", "offline"],
    ]);
    const minimal = await new HealthService({
      db: env.DB,
      version: "0.1.0",
      environment: "test",
      runtimeVersions: {},
      now: () => "x",
    }).report();
    expect(minimal.ok).toBe(true);
    expect(minimal.components.map((component) => component.state)).toEqual([
      "online",
      "unconfigured",
      "unconfigured",
    ]);
  });
});

describe("export store and archive", () => {
  it("lists the newest export first and builds a portable archive", async () => {
    const store = new ExportStore(env.EXPORTS);
    await store.put("exports/d1/2026-09-08.sql", "-- old");
    await store.put("exports/d1/2026-09-09.sql", "-- new");
    expect((await store.latest())?.key).toBe("exports/d1/2026-09-09.sql");
    expect(await store.getText("exports/d1/2026-09-09.sql")).toBe("-- new");
    const clock = fixedClock();
    const archive = await new ExportService(
      new LearnerRepository(env.DB, clock),
      new ContentRepository(env.DB, clock),
      new WorkOrderRepository(env.DB),
      new AttemptRepository(env.DB),
      () => "2026-09-09T12:00:00Z",
    ).archive();
    expect(archive.archive_format).toBe(1);
    expect(archive.learners).toHaveLength(1);
    expect(archive.content_versions).toEqual([]);
  });
});
