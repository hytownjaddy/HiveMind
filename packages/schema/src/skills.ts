import { z } from "zod";

import { definitionStatusSchema } from "./common/enums";
import {
  dottedIdSchema,
  markdownSchema,
  semverSchema,
  slugSchema,
} from "./common/primitives";

/*
 * Global skill registry (RFP §2.3, invariant 7). Skills are versioned and
 * domain-agnostic; courses reference them and never define them.
 */

export const skillIdSchema = dottedIdSchema.describe(
  "Skill id: domain.area.skill, e.g. linux.networking.routing_table",
);
export type SkillId = z.infer<typeof skillIdSchema>;

/** Stable reference to a skill at a version (attempts record what was in force). */
export const skillRefSchema = z.strictObject({
  skill_id: skillIdSchema,
  version: semverSchema,
});
export type SkillRef = z.infer<typeof skillRefSchema>;

export const skillDefinitionSchema = z.strictObject({
  id: skillIdSchema,
  version: semverSchema,
  name: z.string().min(1).max(120),
  domain: slugSchema.describe("Top-level domain slug, e.g. linux, networking, python"),
  description: markdownSchema,
  status: definitionStatusSchema,
  prerequisites: z.array(skillIdSchema),
  related: z.array(skillIdSchema),
  tags: z.array(slugSchema),
  /** Product modes in which this skill can produce evidence (RFP §3). */
  evidence_modes: z.array(
    z.enum([
      "learn",
      "guided_lab",
      "practice",
      "challenge",
      "blind_incident",
      "interview",
      "project",
    ]),
  ),
  /** True when a blind (unguided) assessment of this skill exists or is planned. */
  blind_assessable: z.boolean(),
});
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;

export const skillEdgeKindSchema = z.enum(["prerequisite", "related", "supersedes"]);

export const skillEdgeSchema = z.strictObject({
  from: skillIdSchema,
  to: skillIdSchema,
  kind: skillEdgeKindSchema,
});
export type SkillEdge = z.infer<typeof skillEdgeSchema>;

/** Materialized graph over a set of skill versions; edges are derived from definitions. */
export const skillGraphSchema = z.strictObject({
  version: semverSchema,
  skills: z.array(skillRefSchema),
  edges: z.array(skillEdgeSchema),
});
export type SkillGraph = z.infer<typeof skillGraphSchema>;
