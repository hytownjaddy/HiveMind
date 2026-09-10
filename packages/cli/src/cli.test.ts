import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assemblePrompt, serializeWorkOrderFile } from "@hivemind/core";
import { workOrderFixture } from "@hivemind/schema/fixtures";
import type { WorkOrder } from "@hivemind/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HiveMindApi, type FetchLike } from "./api";
import type { CliConfig } from "./config";
import { run } from "./main";
import type { Output } from "./output";

/*
 * The CLI is exercised against an in-memory API that mimics the v1 route
 * handlers; the services behind the real handlers have their own tests.
 */

const COMPILER_FIXTURE = join(
  import.meta.dirname,
  "..",
  "..",
  "core",
  "src",
  "content",
  "compiler",
  "__fixtures__",
  "valid",
);

function fakeApi(): {
  fetch: FetchLike;
  calls: string[];
  orders: Map<string, WorkOrder>;
  published: unknown[];
} {
  const calls: string[] = [];
  const orders = new Map<string, WorkOrder>();
  const published: unknown[] = [];
  const json = (value: unknown, status = 200): Response =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}${url.search}`);
    const body =
      typeof init?.body === "string"
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {};
    const match = /^\/api\/work-orders\/([^/]+)(?:\/(\w[\w-]*))?$/u.exec(url.pathname);
    if (url.pathname === "/api/content/summary") {
      return json({ content_version_id: null, courses: [], lessons: [] });
    }
    if (url.pathname === "/api/content/versions" && method === "POST") {
      published.push(body["bundle"]);
      return json({
        version: {
          id: "HM-CV-0001",
          content_hash: "a".repeat(64),
          counts: { lessons: 2 },
        },
        reused: false,
      });
    }
    if (url.pathname === "/api/work-orders" && method === "POST") {
      const id = `HM-WO-${String(orders.size + 1).padStart(4, "0")}`;
      const order: WorkOrder = {
        ...workOrderFixture,
        id,
        template: body["template"] as WorkOrder["template"],
        target: body["target"] as WorkOrder["target"],
        instructions: body["instructions"] as string,
        status: "draft",
      };
      orders.set(id, order);
      return json({ order });
    }
    if (url.pathname === "/api/work-orders" && method === "GET") {
      const status = url.searchParams.get("status");
      return json({
        orders: [...orders.values()].filter(
          (order) => status === null || order.status === status,
        ),
      });
    }
    if (url.pathname === "/api/export") {
      return json({ archive_format: 1, learners: [] });
    }
    if (match !== null) {
      const order = orders.get(match[1] ?? "");
      if (order === undefined) {
        return json({ error: "not_found" }, 404);
      }
      const action = match[2];
      if (action === undefined) {
        return json({ order });
      }
      if (action === "export") {
        const updated =
          order.status === "draft" ? { ...order, status: "exported" as const } : order;
        orders.set(order.id, updated);
        return json({ order: updated, file: serializeWorkOrderFile(updated) });
      }
      if (action === "transition") {
        const updated = { ...order, status: body["to"] as WorkOrder["status"] };
        orders.set(order.id, updated);
        return json({ order: updated });
      }
      if (action === "validation-runs") {
        const updated = {
          ...order,
          status: (body["exit_code"] === 0
            ? "review_required"
            : "validation_failed") as WorkOrder["status"],
        };
        orders.set(order.id, updated);
        return json({ order: updated });
      }
      if (action === "complete") {
        const updated = { ...order, status: "implemented" as const };
        orders.set(order.id, updated);
        return json({ order: updated });
      }
    }
    return json({ error: "not_found" }, 404);
  };
  return { fetch: fetchImpl, calls, orders, published };
}

function capture(): Output & { lines: string[]; errors: string[] } {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    log: (line) => lines.push(line),
    error: (line) => errors.push(line),
  };
}

describe("hivemind CLI", () => {
  let root: string;
  let config: CliConfig;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hivemind-cli-"));
    config = {
      apiUrl: "http://api.test",
      accessClientId: undefined,
      accessClientSecret: undefined,
      actor: "jacob",
      root,
    };
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("prints usage without arguments and rejects unknown commands", async () => {
    const out = capture();
    const deps = {
      config,
      api: new HiveMindApi(config, fakeApi().fetch),
      out,
      now: () => "2026-09-09T12:00:00Z",
    };
    expect(await run([], deps)).toBe(1);
    expect(out.lines[0]).toContain("hivemind <group> <command>");
    expect(await run(["work", "explode"], deps)).toBe(1);
    expect(out.errors[0]).toContain("unknown command: work explode");
  });

  it("compiles and publishes content through the API", async () => {
    const api = fakeApi();
    const out = capture();
    const fixtureConfig = { ...config, root: COMPILER_FIXTURE };
    const deps = {
      config: fixtureConfig,
      api: new HiveMindApi(fixtureConfig, api.fetch),
      out,
      now: () => "2026-09-09T12:00:00Z",
    };
    expect(
      await run(
        ["content", "compile", "content", "--out", join(root, "bundle.json")],
        deps,
      ),
    ).toBe(0);
    expect(
      JSON.parse(readFileSync(join(root, "bundle.json"), "utf8")).lessons,
    ).toHaveLength(2);
    expect(await run(["content", "diff", "content"], deps)).toBe(0);
    expect(out.lines.at(-1)).toContain("+ HM-LESSON-demo-course-01");
    expect(await run(["content", "publish", "content", "--note", "first"], deps)).toBe(0);
    expect(api.published).toHaveLength(1);
    expect(out.lines.some((line) => line.startsWith("published HM-CV-0001"))).toBe(true);
  });

  it("creates, pulls, validates, and completes a work order from the file alone", async () => {
    const api = fakeApi();
    const out = capture();
    const commands: string[] = [];
    const deps = {
      config,
      api: new HiveMindApi(config, api.fetch),
      out,
      now: () => "2026-09-09T12:00:00Z",
      runCommand: (command: string) => {
        commands.push(command);
        return { exit_code: 0, output: "ok" };
      },
    };
    expect(
      await run(
        [
          "work",
          "new",
          "lesson.update",
          "--lesson",
          "HM-LESSON-linux-networking-01",
          "--instructions",
          "Tighten the misconception.",
        ],
        deps,
      ),
    ).toBe(0);
    const path = join(root, ".hivemind", "work-orders", "HM-WO-0001.md");
    const file = readFileSync(path, "utf8");
    expect(file.startsWith("---\n")).toBe(true);
    expect(file).toContain("Execute HiveMind Work Order HM-WO-0001.");
    expect(file).toContain("Tighten the misconception.");
    expect(api.orders.get("HM-WO-0001")?.status).toBe("exported");

    expect(await run(["work", "pull"], deps)).toBe(0);
    expect(api.orders.get("HM-WO-0001")?.status).toBe("in_progress");

    expect(await run(["work", "validate", "HM-WO-0001"], deps)).toBe(0);
    expect(commands).toEqual(
      assemblePrompt(api.orders.get("HM-WO-0001")!).includes("bun run verify")
        ? api.orders.get("HM-WO-0001")!.context.validation_commands
        : commands,
    );
    expect(out.lines.at(-1)).toContain("status in_progress unchanged");

    expect(
      await run(
        [
          "work",
          "complete",
          "HM-WO-0001",
          "--summary",
          "Edited lesson.md",
          "--files",
          "a.md,b.md",
        ],
        deps,
      ),
    ).toBe(0);
    expect(api.orders.get("HM-WO-0001")?.status).toBe("implemented");

    expect(await run(["work", "validate", "HM-WO-0001"], deps)).toBe(0);
    expect(api.orders.get("HM-WO-0001")?.status).toBe("review_required");
    expect(api.calls).toContain("POST /api/work-orders/HM-WO-0001/validation-runs");

    expect(await run(["work", "list"], deps)).toBe(0);
    expect(out.lines.at(-1)).toContain("1 order(s); 1 file(s)");
  });

  it("rejects hand-edited prompts and bad ids", async () => {
    const api = fakeApi();
    const out = capture();
    const deps = {
      config,
      api: new HiveMindApi(config, api.fetch),
      out,
      now: () => "2026-09-09T12:00:00Z",
    };
    await run(["work", "new", "platform.feature", "--area", "settings"], deps);
    const path = join(root, ".hivemind", "work-orders", "HM-WO-0001.md");
    const edited = `${readFileSync(path, "utf8")}\nhand edit\n`;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path, edited);
    expect(await run(["work", "validate", "HM-WO-0001", "--skip-commands"], deps)).toBe(
      1,
    );
    expect(out.errors.at(-1)).toContain("differs from the deterministic assembly");
    expect(await run(["work", "validate", "nope"], deps)).toBe(1);
    expect(out.errors.at(-1)).toContain("expected a work-order id");
  });

  it("publishes offline as SQL", async () => {
    const out = capture();
    const fixtureConfig = { ...config, root: COMPILER_FIXTURE };
    const deps = {
      config: fixtureConfig,
      api: new HiveMindApi(fixtureConfig, fakeApi().fetch),
      out,
      now: () => "2026-09-09T12:00:00Z",
    };
    const sqlPath = join(root, "publish.sql");
    expect(await run(["content", "publish", "content", "--sql-out", sqlPath], deps)).toBe(
      0,
    );
    const sql = readFileSync(sqlPath, "utf8");
    expect(sql).toContain("INSERT INTO content_versions");
    expect(sql).toContain("'HM-CV-0001'");
    expect(sql).toContain("INSERT INTO lessons");
    expect(sql).toContain("HM-LESSON-demo-course-01");
    // Literal question marks inside content are fine; bare placeholders are not.
    expect(sql).not.toMatch(/[(,] \?[,)]/u);
  });

  it("records approval in metadata.yaml", async () => {
    const { cpSync } = await import("node:fs");
    cpSync(COMPILER_FIXTURE, join(root, "tree"), { recursive: true });
    const treeConfig = { ...config, root: join(root, "tree") };
    const out = capture();
    const deps = {
      config: treeConfig,
      api: new HiveMindApi(treeConfig, fakeApi().fetch),
      out,
      now: () => "2026-09-09T12:00:00Z",
    };
    expect(
      await run(
        ["content", "approve", "HM-LESSON-demo-course-01", "--by", "jacob", "--publish"],
        deps,
      ),
    ).toBe(0);
    const metadata = readFileSync(
      join(
        root,
        "tree",
        "content",
        "courses",
        "linux",
        "demo-course",
        "modules",
        "01-basics",
        "lessons",
        "01-first",
        "metadata.yaml",
      ),
      "utf8",
    );
    expect(metadata).toContain("qa_state: published");
    expect(metadata).toContain("approved_by: jacob");
    expect(metadata).toContain("approved_at: 2026-09-09T12:00:00Z");
    expect(
      await run(["content", "approve", "HM-LESSON-nope-01", "--by", "jacob"], deps),
    ).toBe(1);
  });

  it("writes the export archive", async () => {
    const api = fakeApi();
    const out = capture();
    const deps = {
      config,
      api: new HiveMindApi(config, api.fetch),
      out,
      now: () => "2026-09-09T12:00:00Z",
    };
    expect(await run(["export", "--out", join(root, "out")], deps)).toBe(0);
    expect(
      JSON.parse(readFileSync(join(root, "out", "archive.json"), "utf8")).archive_format,
    ).toBe(1);
  });

  it("lists and renders topology archetypes deterministically", async () => {
    const out = capture();
    const deps = {
      config,
      api: new HiveMindApi(config, fakeApi().fetch),
      out,
      now: () => "2026-09-09T12:00:00Z",
    };
    expect(await run(["topology", "list"], deps)).toBe(0);
    expect(out.lines.join("\n")).toContain("linux.single@1.0.0 (linux.basic)");
    const target = join(root, "instance.json");
    expect(
      await run(
        [
          "topology",
          "render",
          "bgp.dual_spine",
          "--seed",
          "7",
          "--param",
          "leaf_count=3",
          "--out",
          target,
        ],
        deps,
      ),
    ).toBe(0);
    const instance = JSON.parse(readFileSync(target, "utf8")) as {
      parameters: Record<string, unknown>;
      lab_spec: { nodes: { name: string }[] };
      spec_hash: string;
    };
    expect(instance.parameters["leaf_count"]).toBe(3);
    expect(instance.lab_spec.nodes).toHaveLength(5);
    await expect(run(["topology", "render", "nope.nope"], deps)).resolves.toBe(1);
    expect(out.errors.at(-1)).toContain("unknown archetype");
  });
});
