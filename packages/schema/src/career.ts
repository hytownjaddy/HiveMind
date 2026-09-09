import { z } from "zod";

import { confidenceSchema, definitionStatusSchema } from "./common/enums";
import { learnerIdSchema } from "./common/ids";
import {
  markdownSchema,
  nonNegativeIntSchema,
  percentSchema,
  semverSchema,
  slugSchema,
  timestampSchema,
  unitScoreSchema,
} from "./common/primitives";
import { skillIdSchema } from "./skills";
import { sourceIdSchema } from "./sources";

/*
 * Career targeting (D-002, RFP §153–154). Role profiles are modeled
 * requirements; readiness is alignment with the model, never a hiring
 * probability, and always carries confidence and evidence count.
 */

export const competencySkillSchema = z.strictObject({
  skill_id: skillIdSchema,
  weight: z.number().min(0).max(1),
  min_mastery: unitScoreSchema.optional(),
});

export const competencySchema = z.strictObject({
  id: slugSchema,
  version: semverSchema,
  name: z.string().min(1).max(160),
  category: slugSchema,
  description: markdownSchema,
  status: definitionStatusSchema,
  skills: z.array(competencySkillSchema).min(1),
});
export type Competency = z.infer<typeof competencySchema>;

export const roleCompetencySchema = z.strictObject({
  competency_id: slugSchema,
  weight: z.number().min(0).max(1),
  /** Hard requirement: unmet means a BLOCKING gate (UI-SYSTEM §6). */
  required: z.boolean(),
  min_readiness: unitScoreSchema.optional(),
});

export const roleProfileSchema = z.strictObject({
  id: slugSchema,
  version: semverSchema,
  title: z.string().min(1).max(200),
  company: z.string().max(120).optional(),
  family: slugSchema.describe("Role family, e.g. network-infrastructure"),
  level: z.string().min(1).max(60),
  summary: markdownSchema,
  status: definitionStatusSchema,
  competencies: z.array(roleCompetencySchema).min(1),
  source_ids: z.array(sourceIdSchema),
});
export type RoleProfile = z.infer<typeof roleProfileSchema>;

/** The learner's chosen target; one active per learner. */
export const careerProfileSchema = z.strictObject({
  learner_id: learnerIdSchema,
  role_profile_id: slugSchema,
  role_profile_version: semverSchema,
  active: z.boolean(),
  set_at: timestampSchema,
  notes: markdownSchema.optional(),
});
export type CareerProfile = z.infer<typeof careerProfileSchema>;

export const readinessGateSchema = z.strictObject({
  competency_id: slugSchema,
  blocking: z.boolean(),
  satisfied: z.boolean(),
  score_percent: percentSchema.optional(),
});

export const readinessSnapshotSchema = z.strictObject({
  learner_id: learnerIdSchema,
  role_profile_id: slugSchema,
  role_profile_version: semverSchema,
  algorithm_id: slugSchema,
  algorithm_version: semverSchema,
  score_percent: percentSchema,
  confidence: confidenceSchema,
  evidence_count: nonNegativeIntSchema,
  last_tested_at: timestampSchema.optional(),
  gates: z.array(readinessGateSchema),
  computed_at: timestampSchema,
});
export type ReadinessSnapshot = z.infer<typeof readinessSnapshotSchema>;
