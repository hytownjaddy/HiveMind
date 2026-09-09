import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { WorkOrderRepository } from "../src/db/work-orders";
import { WorkOrderService } from "../src/services/work-orders";
import { parseWorkOrderFile, validateWorkOrderFile } from "../src/work-orders/file";
import { assemblePrompt } from "../src/work-orders/prompt";
import { fixedClock } from "./clock";

function service(): WorkOrderService {
  return new WorkOrderService(new WorkOrderRepository(env.DB), fixedClock());
}

const LESSON = "HM-LESSON-linux-networking-01";

describe("work orders", () => {
  it("creates a draft from a template with deterministic context and ids", async () => {
    const orders = service();
    const order = await orders.create({
      template: "lesson.update",
      target: { kind: "lesson", lesson_id: LESSON },
      instructions: "Add the asymmetric return-path failure as a second misconception.",
      requested_by: "jacob",
      targetPath:
        "content/courses/linux/networking/modules/01-routing/lessons/01-routing-table-ip-route",
    });
    expect(order.id).toBe("HM-WO-0001");
    expect(order.status).toBe("draft");
    expect(order.execution).toBe("external");
    expect(order.context.repository_paths[0]).toContain("01-routing-table-ip-route");
    expect(order.history).toEqual([
      { at: "2026-09-09T12:00:00Z", from: null, to: "draft", by: "jacob" },
    ]);
    const second = await orders.create({
      template: "platform.feature",
      target: { kind: "platform", area: "settings" },
      instructions: "",
      requested_by: "jacob",
    });
    expect(second.id).toBe("HM-WO-0002");
    expect(await orders.counts()).toMatchObject({ draft: 2, exported: 0 });
  });

  it("rejects templates that do not accept the target kind", async () => {
    await expect(
      service().create({
        template: "lesson.update",
        target: { kind: "platform", area: "x" },
        instructions: "",
        requested_by: "jacob",
      }),
    ).rejects.toThrow(/does not accept/u);
  });

  it("exports a self-contained file that parses and validates", async () => {
    const orders = service();
    const created = await orders.create({
      template: "lesson.update",
      target: { kind: "lesson", lesson_id: LESSON },
      instructions: "Tighten it.",
      requested_by: "jacob",
    });
    const exported = await orders.export(created.id, "jacob");
    expect(exported.ok && exported.order.status).toBe("exported");
    const parsed = parseWorkOrderFile(exported.ok ? exported.file : "");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.file.order.id).toBe(created.id);
      expect(validateWorkOrderFile(parsed.file)).toEqual([]);
      expect(parsed.file.prompt).toContain(`Execute HiveMind Work Order ${created.id}.`);
      expect(parsed.file.prompt).toContain("Tighten it.");
      expect(parsed.file.prompt).toContain("hivemind content compile content/");
      expect(
        validateWorkOrderFile({
          ...parsed.file,
          prompt: `${parsed.file.prompt}\nhand edit`,
        }),
      ).toHaveLength(1);
    }
    expect(parseWorkOrderFile("no header").ok).toBe(false);
    const again = await orders.export(created.id, "jacob");
    expect(again.ok && again.order.status).toBe("exported");
  });

  it("walks the state machine and rejects skips", async () => {
    const orders = service();
    const { id } = await orders.create({
      template: "lesson.update",
      target: { kind: "lesson", lesson_id: LESSON },
      instructions: "",
      requested_by: "jacob",
    });
    expect(await orders.transition(id, "done", "jacob")).toEqual({
      ok: false,
      error: "invalid_transition",
      from: "draft",
    });
    await orders.export(id, "jacob");
    expect((await orders.transition(id, "in_progress", "claude")).ok).toBe(true);
    const completed = await orders.complete(
      id,
      {
        written_at: "2026-09-09T13:00:00Z",
        summary: "Edited lesson.md",
        files_changed: ["content/x/lesson.md"],
      },
      "claude",
    );
    expect(completed.ok && completed.order.status).toBe("implemented");
    expect(completed.ok && completed.order.change_report?.summary).toBe(
      "Edited lesson.md",
    );
    const failed = await orders.recordValidation(
      id,
      {
        at: "2026-09-09T13:01:00Z",
        command: "bun run verify",
        exit_code: 1,
        summary: "lint failed",
      },
      "cli",
    );
    expect(failed.ok && failed.order.status).toBe("validation_failed");
    expect((await orders.transition(id, "in_progress", "claude")).ok).toBe(true);
    expect((await orders.transition(id, "implemented", "claude")).ok).toBe(true);
    const passed = await orders.recordValidation(
      id,
      {
        at: "2026-09-09T13:05:00Z",
        command: "bun run verify",
        exit_code: 0,
        summary: "ok",
      },
      "cli",
    );
    expect(passed.ok && passed.order.status).toBe("review_required");
    expect(passed.ok && passed.order.validation_runs).toHaveLength(2);
    expect((await orders.transition(id, "approved", "jacob")).ok).toBe(true);
    expect((await orders.transition(id, "done", "jacob")).ok).toBe(true);
    expect(await orders.transition("HM-WO-9999", "done", "jacob")).toEqual({
      ok: false,
      error: "not_found",
    });
    const final = await orders.get(id);
    expect(final?.history.map((entry) => entry.to)).toEqual([
      "draft",
      "exported",
      "in_progress",
      "implemented",
      "validation_failed",
      "in_progress",
      "implemented",
      "review_required",
      "approved",
      "done",
    ]);
  });

  it("assembles the same prompt for the same order", async () => {
    const orders = service();
    const order = await orders.create({
      template: "lesson.add",
      target: {
        kind: "module",
        course_id: "linux-networking",
        module_id: "linux-networking.routing",
      },
      instructions: "x",
      requested_by: "jacob",
    });
    expect(assemblePrompt(order)).toBe(assemblePrompt(order));
    expect(assemblePrompt(order)).toContain(
      "module `linux-networking.routing` of course `linux-networking`",
    );
  });
});
