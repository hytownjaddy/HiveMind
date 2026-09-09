import { z } from "zod";

import { confidenceSchema, hintTierSchema, productModeSchema } from "./common/enums";
import {
  attemptIdSchema,
  evidenceIdSchema,
  labSessionIdSchema,
  learnerIdSchema,
  lessonIdSchema,
  problemInstanceIdSchema,
} from "./common/ids";
import {
  difficultySchema,
  nonNegativeIntSchema,
  semverSchema,
  slugSchema,
  timestampSchema,
  unitScoreSchema,
} from "./common/primitives";
import { graderResultSchema } from "./grader";
import { skillIdSchema } from "./skills";

/*
 * Attempts, results, evidence, mastery updates (D-014, D-015, D-016,
 * invariant 9). Stage 01 defines the types; Stage 06 computes them. Rows are
 * append-only; new algorithm versions add rows, never rewrite them.
 */

export const hintUseSchema = z.strictObject({
  tier: hintTierSchema.exclude(["none"]),
  at: timestampSchema,
});

export const attemptSchema = z.strictObject({
  id: attemptIdSchema,
  learner_id: learnerIdSchema,
  mode: productModeSchema,
  lesson_id: lessonIdSchema.optional(),
  problem_instance_id: problemInstanceIdSchema.optional(),
  lab_session_id: labSessionIdSchema.optional(),
  /** Versions in force when the attempt started (invariants 6–8). */
  course_version: semverSchema.optional(),
  skill_versions: z.array(
    z.strictObject({ skill_id: skillIdSchema, version: semverSchema }),
  ),
  started_at: timestampSchema,
  finished_at: timestampSchema.optional(),
  status: z.enum(["in_progress", "submitted", "graded", "abandoned", "expired"]),
  hints: z.array(hintUseSchema),
});
export type Attempt = z.infer<typeof attemptSchema>;

/** Deterministic outcome of an attempt; AI methodology review lives elsewhere (D-015). */
export const attemptResultSchema = z.strictObject({
  attempt_id: attemptIdSchema,
  grader_result: graderResultSchema.optional(),
  objectives_total: nonNegativeIntSchema,
  objectives_passed: nonNegativeIntSchema,
  technical_score: unitScoreSchema,
  /** Strongest hint used; caps independent-mastery credit (D-016). */
  independence: hintTierSchema,
  duration_seconds: nonNegativeIntSchema,
  recorded_at: timestampSchema,
});
export type AttemptResult = z.infer<typeof attemptResultSchema>;

export const evidenceKindSchema = z.enum([
  "lesson_question",
  "guided_lab",
  "practice_problem",
  "challenge",
  "blind_incident",
  "interview",
  "project",
]);

export const evidenceSchema = z.strictObject({
  id: evidenceIdSchema,
  attempt_id: attemptIdSchema,
  learner_id: learnerIdSchema,
  skill_id: skillIdSchema,
  skill_version: semverSchema,
  kind: evidenceKindSchema,
  correctness: unitScoreSchema,
  independence: hintTierSchema,
  difficulty: difficultySchema,
  blind: z.boolean(),
  created_at: timestampSchema,
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const masteryUpdateSchema = z.strictObject({
  learner_id: learnerIdSchema,
  skill_id: skillIdSchema,
  skill_version: semverSchema,
  algorithm_id: slugSchema,
  algorithm_version: semverSchema,
  mastery_before: unitScoreSchema,
  mastery_after: unitScoreSchema,
  confidence: confidenceSchema,
  evidence_count: nonNegativeIntSchema,
  evidence_ids: z.array(evidenceIdSchema),
  created_at: timestampSchema,
});
export type MasteryUpdate = z.infer<typeof masteryUpdateSchema>;
