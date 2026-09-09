import { z } from "zod";

import { capabilitySchema } from "./capability";
import { definitionStatusSchema, productModeSchema, qaStateSchema } from "./common/enums";
import { contentVersionIdSchema, lessonIdSchema } from "./common/ids";
import {
  difficultySchema,
  markdownSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  semverSchema,
  sha256Schema,
  slugSchema,
  timestampSchema,
} from "./common/primitives";
import { lessonSectionSchema } from "./lesson-body";
import { skillDefinitionSchema, skillIdSchema } from "./skills";
import { claimSchema, sourceIdSchema, sourceRecordSchema } from "./sources";

/*
 * Course package format (COURSE_AUTHORING.md, invariants 1, 2, 6, 10).
 * Courses are versioned packages of modules of lessons; they reference skills
 * from the global registry and declare the capabilities their labs need.
 * `uses_labs` is explicit because not every course has labs (invariant 2).
 */

export const courseIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, "invalid-course-id")
  .describe("Course id slug, e.g. linux-networking");
export type CourseId = z.infer<typeof courseIdSchema>;

export const moduleIdSchema = z
  .string()
  .regex(/^[a-z0-9-]+\.[a-z0-9-]+$/u, "invalid-module-id")
  .describe("Module id <course>.<slug>, e.g. linux-networking.routing");
export type ModuleId = z.infer<typeof moduleIdSchema>;

export const questionKindSchema = z.enum([
  "prediction",
  "knowledge_check",
  "reflection",
  "mastery",
]);
export type QuestionKind = z.infer<typeof questionKindSchema>;

/** Multiple-choice option; `correct` is stripped from learner-facing responses (UI-SYSTEM §10). */
export const questionOptionSchema = z.strictObject({
  id: slugSchema,
  text: markdownSchema,
  correct: z.boolean(),
  feedback: markdownSchema.optional(),
});

export const questionSchema = z.strictObject({
  id: slugSchema,
  lesson_id: lessonIdSchema,
  kind: questionKindSchema,
  prompt: markdownSchema,
  /** Present for multiple choice; absent for free-text prediction and reflection. */
  options: z.array(questionOptionSchema).min(2).optional(),
  /** Model answer for free-text questions; author-only until the learner commits. */
  answer: markdownSchema.optional(),
  explanation: markdownSchema,
  skill_ids: z.array(skillIdSchema),
  difficulty: difficultySchema,
});
export type Question = z.infer<typeof questionSchema>;

export const learningObjectiveSchema = z.strictObject({
  id: slugSchema,
  text: z.string().min(1).max(300),
  /** Fine-grained skills this objective evidences; several when it spans skills. */
  skill_ids: z.array(skillIdSchema).min(1),
});
export type LearningObjective = z.infer<typeof learningObjectiveSchema>;

/**
 * Declared grader invariants for a lab referenced from a lesson: what must hold,
 * what must be preserved, what disqualifies a solution. Stage 03 graders must
 * honour them; until then they are authored intent.
 */
export const graderConstraintsSchema = z.strictObject({
  required: z.array(z.string().min(1).max(200)).min(1),
  preserve: z.array(z.string().min(1).max(200)),
  reject: z.array(z.string().min(1).max(200)),
});
export type GraderConstraints = z.infer<typeof graderConstraintsSchema>;

/** Pointer from a lesson to a problem archetype; faults are never named here. */
export const lessonLabRefSchema = z.strictObject({
  problem_id: slugSchema,
  mode: productModeSchema,
  title: z.string().min(1).max(200),
  grader_constraints: graderConstraintsSchema.optional(),
});

/** Time estimate split by activity; `total` must equal the sum (compiler-checked). */
export const estimatedMinutesSchema = z.strictObject({
  instruction: nonNegativeIntSchema,
  guided_lab: nonNegativeIntSchema,
  independent_practice: nonNegativeIntSchema,
  total: positiveIntSchema,
});
export type EstimatedMinutes = z.infer<typeof estimatedMinutesSchema>;

export const lessonReviewSchema = z.strictObject({
  technical_reviewed_by: z.string().max(120).optional(),
  technical_reviewed_at: timestampSchema.optional(),
  instructional_reviewed_by: z.string().max(120).optional(),
  instructional_reviewed_at: timestampSchema.optional(),
  execution_tested_at: timestampSchema.optional(),
  approved_by: z.string().max(120).optional(),
  approved_at: timestampSchema.optional(),
  notes: markdownSchema.optional(),
});
export type LessonReview = z.infer<typeof lessonReviewSchema>;

export const lessonSchema = z.strictObject({
  id: lessonIdSchema,
  course_id: courseIdSchema,
  module_id: moduleIdSchema,
  version: semverSchema,
  slug: slugSchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(600),
  order: positiveIntSchema,
  qa_state: qaStateSchema,
  review: lessonReviewSchema,
  objectives: z.array(learningObjectiveSchema).min(1),
  skill_ids: z.array(skillIdSchema).min(1),
  prerequisite_lesson_ids: z.array(lessonIdSchema),
  difficulty: difficultySchema,
  estimated_minutes: estimatedMinutesSchema,
  /** Body compiled from lesson.md; each section is one RFP §110 element. */
  sections: z.array(lessonSectionSchema),
  questions: z.array(questionSchema),
  claims: z.array(claimSchema),
  labs: z.array(lessonLabRefSchema),
  source_ids: z.array(sourceIdSchema),
  /** SHA-256 of the canonical compiled body; changes force a version bump. */
  body_hash: sha256Schema,
  /** Repository directory the lesson was compiled from; work orders point Claude Code here. */
  source_path: z.string().min(1).optional(),
});
export type Lesson = z.infer<typeof lessonSchema>;

export const moduleSchema = z.strictObject({
  id: moduleIdSchema,
  course_id: courseIdSchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(600),
  order: positiveIntSchema,
  lesson_ids: z.array(lessonIdSchema),
  skill_ids: z.array(skillIdSchema),
  source_path: z.string().min(1).optional(),
});
export type Module = z.infer<typeof moduleSchema>;

export const courseManifestSchema = z.strictObject({
  id: courseIdSchema,
  version: semverSchema,
  title: z.string().min(1).max(200),
  domain: slugSchema,
  summary: z.string().min(1).max(600),
  status: definitionStatusSchema,
  /** Career tracks this course belongs to (D-002), e.g. network-infrastructure. */
  tracks: z.array(slugSchema),
  prerequisite_course_ids: z.array(courseIdSchema),
  skill_ids: z.array(skillIdSchema).min(1),
  /** Whether any module has labs (invariant 2). */
  uses_labs: z.boolean(),
  /** Union of capabilities required by the course's labs; empty when `uses_labs` is false. */
  capabilities: z.array(capabilitySchema),
  module_ids: z.array(moduleIdSchema).min(1),
  source_ids: z.array(sourceIdSchema),
  source_path: z.string().min(1).optional(),
});
export type CourseManifest = z.infer<typeof courseManifestSchema>;

/** Output of `hivemind content compile`: everything a content version contains. */
export const contentBundleSchema = z.strictObject({
  bundle_format: z.literal(1),
  generated_at: timestampSchema,
  git_commit: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/u)
    .optional(),
  content_hash: sha256Schema,
  courses: z.array(courseManifestSchema),
  modules: z.array(moduleSchema),
  lessons: z.array(lessonSchema),
  skills: z.array(skillDefinitionSchema),
  sources: z.array(sourceRecordSchema),
});
export type ContentBundle = z.infer<typeof contentBundleSchema>;

/** Immutable published snapshot (invariant 6); rollback is publishing an earlier one. */
export const contentVersionSchema = z.strictObject({
  id: contentVersionIdSchema,
  created_at: timestampSchema,
  content_hash: sha256Schema,
  git_commit: z
    .string()
    .regex(/^[a-f0-9]{7,40}$/u)
    .optional(),
  published_by: z.string().min(1).max(120),
  note: z.string().max(500).optional(),
  course_ids: z.array(courseIdSchema),
  counts: z.strictObject({
    courses: nonNegativeIntSchema,
    modules: nonNegativeIntSchema,
    lessons: nonNegativeIntSchema,
    skills: nonNegativeIntSchema,
    sources: nonNegativeIntSchema,
  }),
});
export type ContentVersion = z.infer<typeof contentVersionSchema>;
