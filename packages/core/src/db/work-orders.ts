import {
  formatWorkOrderId,
  reviewItemSchema,
  workOrderSchema,
  type ReviewItem,
  type WorkOrder,
  type WorkOrderStatus,
} from "@hivemind/schema";

import { allRows, nextSequence, parseJsonColumn, type Database } from "./index";

export interface WorkOrderFilter {
  readonly status?: WorkOrderStatus | undefined;
  readonly limit?: number | undefined;
}

export class WorkOrderRepository {
  constructor(private readonly db: Database) {}

  async nextId(): Promise<string> {
    return formatWorkOrderId(await nextSequence(this.db, "work_orders"));
  }

  async insert(order: WorkOrder): Promise<void> {
    const parsed = workOrderSchema.parse(order);
    await this.db
      .prepare(
        "INSERT INTO work_orders (id, template, title, status, priority, execution, target_kind, target_id, requested_by, created_at, updated_at, order_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        parsed.id,
        parsed.template,
        parsed.title,
        parsed.status,
        parsed.priority,
        parsed.execution,
        parsed.target.kind,
        targetId(parsed),
        parsed.requested_by,
        parsed.created_at,
        parsed.updated_at,
        JSON.stringify(parsed),
      )
      .run();
  }

  async update(order: WorkOrder): Promise<void> {
    const parsed = workOrderSchema.parse(order);
    await this.db
      .prepare(
        "UPDATE work_orders SET title = ?, status = ?, priority = ?, updated_at = ?, order_json = ? WHERE id = ?",
      )
      .bind(
        parsed.title,
        parsed.status,
        parsed.priority,
        parsed.updated_at,
        JSON.stringify(parsed),
        parsed.id,
      )
      .run();
  }

  async get(id: string): Promise<WorkOrder | null> {
    const row = await this.db
      .prepare("SELECT order_json FROM work_orders WHERE id = ?")
      .bind(id)
      .first<{ order_json: string }>();
    return row === null
      ? null
      : parseJsonColumn(row.order_json, (v) => workOrderSchema.parse(v));
  }

  async list(filter: WorkOrderFilter = {}): Promise<WorkOrder[]> {
    const limit = filter.limit ?? 100;
    const statement =
      filter.status === undefined
        ? this.db
            .prepare(
              "SELECT order_json FROM work_orders ORDER BY updated_at DESC, id DESC LIMIT ?",
            )
            .bind(limit)
        : this.db
            .prepare(
              "SELECT order_json FROM work_orders WHERE status = ? ORDER BY updated_at DESC, id DESC LIMIT ?",
            )
            .bind(filter.status, limit);
    const rows = await allRows<{ order_json: string }>(statement);
    return rows.map((row) =>
      parseJsonColumn(row.order_json, (v) => workOrderSchema.parse(v)),
    );
  }

  async countsByStatus(): Promise<Record<WorkOrderStatus, number>> {
    const rows = await allRows<{ status: WorkOrderStatus; count: number }>(
      this.db.prepare(
        "SELECT status, COUNT(*) AS count FROM work_orders GROUP BY status",
      ),
    );
    const counts: Record<WorkOrderStatus, number> = {
      draft: 0,
      exported: 0,
      in_progress: 0,
      implemented: 0,
      validation_failed: 0,
      review_required: 0,
      approved: 0,
      done: 0,
    };
    for (const row of rows) {
      counts[row.status] = row.count;
    }
    return counts;
  }
}

function targetId(order: WorkOrder): string | null {
  switch (order.target.kind) {
    case "lesson":
      return order.target.lesson_id;
    case "module":
      return order.target.module_id;
    case "course":
      return order.target.course_id;
    case "skill":
      return order.target.skill_id;
    case "problem":
      return order.target.problem_id;
    case "platform":
      return order.target.area;
  }
}

export class ReviewItemRepository {
  constructor(private readonly db: Database) {}

  async insert(item: ReviewItem): Promise<void> {
    const parsed = reviewItemSchema.parse(item);
    await this.db
      .prepare(
        "INSERT INTO review_items (id, kind, target_id, qa_state, opened_at, resolved_at, reviewer, resolution, work_order_id, item_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        parsed.id,
        parsed.kind,
        parsed.target_id,
        parsed.qa_state,
        parsed.opened_at,
        parsed.resolved_at ?? null,
        parsed.reviewer ?? null,
        parsed.resolution ?? null,
        parsed.work_order_id ?? null,
        JSON.stringify(parsed),
      )
      .run();
  }

  async listOpen(limit = 50): Promise<ReviewItem[]> {
    const rows = await allRows<{ item_json: string }>(
      this.db
        .prepare(
          "SELECT item_json FROM review_items WHERE resolved_at IS NULL ORDER BY opened_at ASC LIMIT ?",
        )
        .bind(limit),
    );
    return rows.map((row) =>
      parseJsonColumn(row.item_json, (v) => reviewItemSchema.parse(v)),
    );
  }
}
