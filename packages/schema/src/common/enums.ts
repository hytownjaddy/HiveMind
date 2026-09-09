import { z } from "zod";

/*
 * Canonical vocabularies (D-038, UI-SYSTEM §5). Values are lowercase snake case
 * everywhere: UI chips, API, CLI, logs, D1.
 */

/** Lab session lifecycle, RFP §86 verbatim. */
export const LAB_STATUSES = [
  "queued",
  "provisioning",
  "baseline_check",
  "fault_injection",
  "fault_check",
  "ready",
  "active",
  "grading",
  "completed",
  "destroying",
  "destroyed",
  "failed",
] as const;
export const labStatusSchema = z
  .enum(LAB_STATUSES)
  .describe("Lab lifecycle state, RFP §86");
export type LabStatus = z.infer<typeof labStatusSchema>;
export const TERMINAL_STATUSES: readonly LabStatus[] = ["ready", "active"];
export const FINAL_STATUSES: readonly LabStatus[] = ["destroyed", "failed"];

export const CONNECTION_STATES = [
  "connecting",
  "synchronizing",
  "online",
  "offline",
  "finished",
] as const;
export const connectionStateSchema = z.enum(CONNECTION_STATES);
export type ConnectionState = z.infer<typeof connectionStateSchema>;

/** Content QA pipeline (D-010, COURSE_AUTHORING). */
export const QA_STATES = [
  "draft",
  "technical_review",
  "instructional_review",
  "execution_test",
  "approved",
  "published",
  "deprecated",
  "archived",
] as const;
export const qaStateSchema = z.enum(QA_STATES).describe("Content QA state");
export type QaState = z.infer<typeof qaStateSchema>;

export const WORK_ORDER_STATUSES = [
  "draft",
  "exported",
  "in_progress",
  "implemented",
  "validation_failed",
  "review_required",
  "approved",
  "done",
] as const;
export const workOrderStatusSchema = z
  .enum(WORK_ORDER_STATUSES)
  .describe("Work-order state");
export type WorkOrderStatus = z.infer<typeof workOrderStatusSchema>;

export const FRESHNESS_STATES = [
  "current",
  "needs_review",
  "stale",
  "broken",
  "update_available",
] as const;
export const freshnessStateSchema = z.enum(FRESHNESS_STATES);
export type FreshnessState = z.infer<typeof freshnessStateSchema>;

/** Confidence tier shown beside every percentage (D-014, RFP §153). */
export const confidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof confidenceSchema>;

/** Source trust tiers (D-011, UI-SYSTEM §13). */
export const trustTierSchema = z.enum(["official", "vendor", "secondary", "internal"]);
export type TrustTier = z.infer<typeof trustTierSchema>;

/** AI execution modes (D-009). `external` is the default everywhere. */
export const executionModeSchema = z.enum(["external", "api"]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

/** Execution classes (D-035). */
export const executionClassSchema = z.enum(["A", "B", "C"]);
export type ExecutionClass = z.infer<typeof executionClassSchema>;

/** Hint tiers cap mastery gain; they never subtract (D-016). */
export const hintTierSchema = z.enum(["none", "minor", "strong", "solution"]);
export type HintTier = z.infer<typeof hintTierSchema>;

/** Product modes, RFP §3. */
export const productModeSchema = z.enum([
  "learn",
  "guided_lab",
  "practice",
  "challenge",
  "blind_incident",
  "interview",
  "project",
]);
export type ProductMode = z.infer<typeof productModeSchema>;

/** Lifecycle of a versioned definition (skill, course, grader, role profile). */
export const definitionStatusSchema = z.enum(["active", "deprecated", "archived"]);
export type DefinitionStatus = z.infer<typeof definitionStatusSchema>;

/** The twelve elements of a high-quality lesson, RFP §110, in order. */
export const LESSON_ELEMENTS = [
  "motivation",
  "mental_model",
  "explanation",
  "diagram",
  "worked_example",
  "misconception",
  "prediction",
  "guided_exercise",
  "demonstration",
  "independent_problem",
  "reflection",
  "mastery_evaluation",
] as const;
export const lessonElementSchema = z
  .enum(LESSON_ELEMENTS)
  .describe("RFP §110 lesson element");
export type LessonElement = z.infer<typeof lessonElementSchema>;
