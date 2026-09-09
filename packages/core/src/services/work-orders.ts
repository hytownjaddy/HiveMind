import {
  canTransitionWorkOrder,
  workOrderSchema,
  type ChangeReport,
  type ValidationRun,
  type WorkOrder,
  type WorkOrderStatus,
  type WorkOrderTarget,
  type WorkOrderTemplate,
} from "@hivemind/schema";

import type { Clock } from "../db/index";
import type { WorkOrderRepository } from "../db/work-orders";
import { serializeWorkOrderFile } from "../work-orders/file";
import { assemblePrompt } from "../work-orders/prompt";
import { templateFor } from "../work-orders/templates";

/*
 * Work-order application service (D-009, 14-work-orders.md). Route handlers
 * and the CLI call these; state changes go through the D-038 machine.
 */

export interface CreateWorkOrderInput {
  readonly template: WorkOrderTemplate;
  readonly target: WorkOrderTarget;
  readonly instructions: string;
  readonly requested_by: string;
  readonly title?: string | undefined;
  readonly priority?: WorkOrder["priority"] | undefined;
  readonly labels?: readonly string[] | undefined;
  readonly dependencies?: readonly string[] | undefined;
  readonly effort?: WorkOrder["effort"] | undefined;
  readonly targetPath?: string | undefined;
}

export type TransitionOutcome =
  | { readonly ok: true; readonly order: WorkOrder }
  | {
      readonly ok: false;
      readonly error: "not_found" | "invalid_transition";
      readonly from?: WorkOrderStatus;
    };

export class WorkOrderService {
  constructor(
    private readonly orders: WorkOrderRepository,
    private readonly clock: Clock,
  ) {}

  async create(input: CreateWorkOrderInput): Promise<WorkOrder> {
    const definition = templateFor(input.template);
    if (!definition.targetKinds.includes(input.target.kind)) {
      throw new Error(
        `template ${input.template} does not accept a ${input.target.kind} target`,
      );
    }
    const now = this.clock.now();
    const id = await this.orders.nextId();
    const templateInput = { target: input.target, targetPath: input.targetPath };
    const order = workOrderSchema.parse({
      id,
      template: input.template,
      title: input.title ?? definition.title(templateInput),
      status: "draft",
      priority: input.priority ?? "normal",
      execution: "external",
      target: input.target,
      requested_by: input.requested_by,
      created_at: now,
      updated_at: now,
      instructions: input.instructions,
      context: definition.context(templateInput),
      labels: input.labels ?? [],
      dependencies: input.dependencies ?? [],
      ...(input.effort === undefined ? {} : { effort: input.effort }),
      validation_runs: [],
      history: [{ at: now, from: null, to: "draft", by: input.requested_by }],
    });
    await this.orders.insert(order);
    return order;
  }

  async get(id: string): Promise<WorkOrder | null> {
    return this.orders.get(id);
  }

  async list(status?: WorkOrderStatus, limit?: number): Promise<WorkOrder[]> {
    return this.orders.list({ status, limit });
  }

  async counts(): Promise<Record<WorkOrderStatus, number>> {
    return this.orders.countsByStatus();
  }

  prompt(order: WorkOrder): string {
    return assemblePrompt(order);
  }

  file(order: WorkOrder): string {
    return serializeWorkOrderFile(order);
  }

  async transition(
    id: string,
    to: WorkOrderStatus,
    by: string,
    note?: string,
  ): Promise<TransitionOutcome> {
    const order = await this.orders.get(id);
    if (order === null) {
      return { ok: false, error: "not_found" };
    }
    if (!canTransitionWorkOrder(order.status, to)) {
      return { ok: false, error: "invalid_transition", from: order.status };
    }
    const now = this.clock.now();
    const updated = workOrderSchema.parse({
      ...order,
      status: to,
      updated_at: now,
      history: [
        ...order.history,
        { at: now, from: order.status, to, by, ...(note === undefined ? {} : { note }) },
      ],
    });
    await this.orders.update(updated);
    return { ok: true, order: updated };
  }

  /** Export marks a draft as exported and returns the file content (idempotent once exported). */
  async export(
    id: string,
    by: string,
  ): Promise<
    { ok: true; order: WorkOrder; file: string } | { ok: false; error: "not_found" }
  > {
    const order = await this.orders.get(id);
    if (order === null) {
      return { ok: false, error: "not_found" };
    }
    let current = order;
    if (order.status === "draft") {
      const outcome = await this.transition(
        id,
        "exported",
        by,
        "exported for Claude Code",
      );
      if (outcome.ok) {
        current = outcome.order;
      }
    }
    return { ok: true, order: current, file: serializeWorkOrderFile(current) };
  }

  async recordValidation(
    id: string,
    run: ValidationRun,
    by: string,
  ): Promise<TransitionOutcome> {
    const order = await this.orders.get(id);
    if (order === null) {
      return { ok: false, error: "not_found" };
    }
    const withRun = workOrderSchema.parse({
      ...order,
      validation_runs: [...order.validation_runs, run],
      updated_at: this.clock.now(),
    });
    await this.orders.update(withRun);
    const to: WorkOrderStatus =
      run.exit_code === 0 ? "review_required" : "validation_failed";
    return this.transition(
      id,
      to,
      by,
      `validation ${run.exit_code === 0 ? "passed" : "failed"}: ${run.command}`,
    );
  }

  async complete(
    id: string,
    report: ChangeReport,
    by: string,
  ): Promise<TransitionOutcome> {
    const order = await this.orders.get(id);
    if (order === null) {
      return { ok: false, error: "not_found" };
    }
    const withReport = workOrderSchema.parse({
      ...order,
      change_report: report,
      updated_at: this.clock.now(),
    });
    await this.orders.update(withReport);
    return this.transition(id, "implemented", by, "change report written");
  }
}
