import { z } from "zod";

import {
  executionModeSchema,
  qaStateSchema,
  workOrderStatusSchema,
  type WorkOrderStatus,
} from "./common/enums";
import { lessonIdSchema, reviewItemIdSchema, workOrderIdSchema } from "./common/ids";
import { markdownSchema, slugSchema, timestampSchema } from "./common/primitives";

/*
 * Work orders (D-009, 14-work-orders.md). A work order is a self-contained
 * task for Claude Code: it lives as `.hivemind/work-orders/<id>.md` (YAML
 * header + prompt) and as a D1 row. Execution is external by default; no
 * assignee, no agent logs.
 */

export const WORK_ORDER_TEMPLATES = [
  "lesson.add",
  "lesson.update",
  "problem.create",
  "platform.feature",
] as const;
export const workOrderTemplateSchema = z.enum(WORK_ORDER_TEMPLATES);
export type WorkOrderTemplate = z.infer<typeof workOrderTemplateSchema>;

export const workOrderPrioritySchema = z.enum(["low", "normal", "high"]);

/** What the order is about; drives deterministic prompt assembly. */
export const workOrderTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("lesson"), lesson_id: lessonIdSchema }),
  z.strictObject({
    kind: z.literal("module"),
    course_id: z.string().min(1),
    module_id: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal("course"), course_id: z.string().min(1) }),
  z.strictObject({ kind: z.literal("skill"), skill_id: z.string().min(1) }),
  z.strictObject({ kind: z.literal("problem"), problem_id: slugSchema }),
  z.strictObject({ kind: z.literal("platform"), area: slugSchema }),
]);
export type WorkOrderTarget = z.infer<typeof workOrderTargetSchema>;

/** Deterministically assembled inputs; the prompt is a pure function of these. */
export const workOrderContextSchema = z.strictObject({
  repository_paths: z.array(z.string().min(1)),
  schemas: z.array(z.string().min(1)),
  acceptance_criteria: z.array(z.string().min(1)).min(1),
  validation_commands: z.array(z.string().min(1)).min(1),
  expected_output: z.array(z.string().min(1)).min(1),
  source_requirements: z.array(z.string().min(1)),
});
export type WorkOrderContext = z.infer<typeof workOrderContextSchema>;

export const validationRunSchema = z.strictObject({
  at: timestampSchema,
  command: z.string().min(1),
  exit_code: z.int(),
  summary: z.string().max(2000),
});
export type ValidationRun = z.infer<typeof validationRunSchema>;

export const changeReportSchema = z.strictObject({
  written_at: timestampSchema,
  summary: markdownSchema,
  files_changed: z.array(z.string().min(1)),
  commit: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/u)
    .optional(),
});
export type ChangeReport = z.infer<typeof changeReportSchema>;

export const workOrderTransitionSchema = z.strictObject({
  at: timestampSchema,
  from: workOrderStatusSchema.nullable(),
  to: workOrderStatusSchema,
  by: z.string().min(1).max(120),
  note: z.string().max(500).optional(),
});
export type WorkOrderTransition = z.infer<typeof workOrderTransitionSchema>;

export const workOrderSchema = z.strictObject({
  id: workOrderIdSchema,
  template: workOrderTemplateSchema,
  title: z.string().min(1).max(200),
  status: workOrderStatusSchema,
  priority: workOrderPrioritySchema,
  execution: executionModeSchema,
  target: workOrderTargetSchema,
  requested_by: z.string().min(1).max(120),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  /** Jacob's freeform instructions, included verbatim in the prompt. */
  instructions: markdownSchema,
  context: workOrderContextSchema,
  labels: z.array(slugSchema),
  dependencies: z.array(workOrderIdSchema),
  effort: z.enum(["xs", "s", "m", "l", "xl"]).optional(),
  validation_runs: z.array(validationRunSchema),
  change_report: changeReportSchema.optional(),
  history: z.array(workOrderTransitionSchema),
});
export type WorkOrder = z.infer<typeof workOrderSchema>;

/** Allowed state changes (CONTRIBUTING.md); anything else is rejected. */
export const WORK_ORDER_TRANSITIONS: Readonly<
  Record<WorkOrderStatus, readonly WorkOrderStatus[]>
> = {
  draft: ["exported"],
  exported: ["in_progress", "draft"],
  in_progress: ["implemented"],
  implemented: ["validation_failed", "review_required"],
  validation_failed: ["in_progress"],
  review_required: ["approved", "in_progress"],
  approved: ["done"],
  done: [],
};

export function canTransitionWorkOrder(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
): boolean {
  return WORK_ORDER_TRANSITIONS[from].includes(to);
}

export const reviewItemKindSchema = z.enum([
  "lesson",
  "claim",
  "problem",
  "source",
  "work_order",
]);

export const reviewItemSchema = z.strictObject({
  id: reviewItemIdSchema,
  kind: reviewItemKindSchema,
  target_id: z.string().min(1),
  qa_state: qaStateSchema,
  opened_at: timestampSchema,
  resolved_at: timestampSchema.optional(),
  reviewer: z.string().max(120).optional(),
  resolution: z.enum(["approved", "rejected", "changes_requested"]).optional(),
  notes: markdownSchema.optional(),
  work_order_id: workOrderIdSchema.optional(),
});
export type ReviewItem = z.infer<typeof reviewItemSchema>;
