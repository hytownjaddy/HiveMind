import { z } from "zod";

import { capabilitySchema } from "./capability";
import {
  definitionStatusSchema,
  hintTierSchema,
  productModeSchema,
  qaStateSchema,
} from "./common/enums";
import { problemInstanceIdSchema } from "./common/ids";
import {
  difficultySchema,
  jsonObjectSchema,
  markdownSchema,
  percentSchema,
  positiveIntSchema,
  semverSchema,
  sha256Schema,
  slugSchema,
  timestampSchema,
} from "./common/primitives";
import { faultParameterSchema } from "./fault";
import { skillIdSchema } from "./skills";

/*
 * Problem archetypes and instances (RFP §2.4, §46, §47, invariant 5). An
 * archetype is topology + objectives + variation dimensions + faults + grader;
 * an instance is the archetype resolved by seed and pinned versions, with a
 * spec hash so it can be reproduced exactly.
 */

export const problemObjectiveSchema = z.strictObject({
  id: slugSchema,
  text: z.string().min(1).max(300),
  skill_id: skillIdSchema.optional(),
  /** Grader check ids that evidence this objective. */
  check_ids: z.array(slugSchema),
});

export const problemHintSchema = z.strictObject({
  tier: hintTierSchema.exclude(["none"]),
  text: markdownSchema,
  /** Maximum independent-mastery credit remaining after this hint (D-016). */
  mastery_cap_percent: percentSchema,
});
export type ProblemHint = z.infer<typeof problemHintSchema>;

export const faultRefSchema = z.strictObject({
  fault_id: slugSchema,
  version: semverSchema,
  /** Parameter values or `seeded` to draw from the fault's parameter space. */
  parameters: jsonObjectSchema.optional(),
});

export const problemSpecSchema = z.strictObject({
  id: slugSchema,
  version: semverSchema,
  title: z.string().min(1).max(200),
  domain: slugSchema,
  status: definitionStatusSchema,
  qa_state: qaStateSchema,
  summary: z.string().min(1).max(600),
  /** Learner-facing scenario; never names the fault (UI-SYSTEM §10). */
  scenario: markdownSchema,
  skill_ids: z.array(skillIdSchema).min(1),
  difficulty: difficultySchema,
  modes: z.array(productModeSchema).min(1),
  requires: z.array(capabilitySchema).min(1),
  lab_spec_id: slugSchema,
  lab_spec_version: semverSchema,
  objectives: z.array(problemObjectiveSchema).min(1),
  variation: z.array(faultParameterSchema),
  faults: z.array(faultRefSchema),
  grader_id: slugSchema,
  grader_version: semverSchema,
  /** Reference solution implementation on the worker, versioned. */
  reference_solution: z.string().regex(/^[a-z0-9_.]+:[a-z0-9_]+$/u, "invalid-module-ref"),
  reference_solution_version: semverSchema,
  hints: z.array(problemHintSchema),
  time_limit_minutes: positiveIntSchema.optional(),
});
export type ProblemSpec = z.infer<typeof problemSpecSchema>;

/** RFP §46 pipeline step outcome; an instance is usable only when every step passed. */
export const validationStepSchema = z.strictObject({
  step: z.enum([
    "schema_validation",
    "provision_baseline",
    "validate_baseline",
    "inject_fault",
    "verify_failure",
    "execute_reference_solution",
    "run_graders",
    "restore_scenario",
  ]),
  passed: z.boolean(),
  at: timestampSchema,
  detail: z.string().max(1000).optional(),
});

export const problemInstanceSchema = z.strictObject({
  id: problemInstanceIdSchema,
  problem_id: slugSchema,
  problem_version: semverSchema,
  seed: z.int().min(0),
  lab_spec_version: semverSchema,
  fault_versions: z.array(
    z.strictObject({ fault_id: slugSchema, version: semverSchema }),
  ),
  grader_version: semverSchema,
  reference_solution_version: semverSchema,
  /** Variation values resolved from the seed. */
  parameters: jsonObjectSchema,
  /** SHA-256 over the canonical resolved spec; equal hashes are identical labs. */
  spec_hash: sha256Schema,
  validation: z.enum(["pending", "validated", "rejected"]),
  validation_steps: z.array(validationStepSchema),
  created_at: timestampSchema,
});
export type ProblemInstance = z.infer<typeof problemInstanceSchema>;
