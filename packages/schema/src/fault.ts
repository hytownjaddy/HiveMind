import { z } from "zod";

import { capabilitySchema } from "./capability";
import { definitionStatusSchema } from "./common/enums";
import {
  jsonObjectSchema,
  markdownSchema,
  semverSchema,
  slugSchema,
} from "./common/primitives";

/*
 * Fault modules (RFP §2.1, invariant 4). A fault spec declares intent and the
 * checks that prove the fault took effect; a versioned implementation on the
 * lab worker executes it. Learner-facing surfaces never show `description`,
 * `inject`, or `restore` (UI-SYSTEM §10).
 */

export const faultParameterSchema = z.strictObject({
  name: slugSchema,
  kind: z.enum(["choice", "int_range", "string", "boolean"]),
  /** Allowed values for `choice`, `[min, max]` for `int_range`. */
  values: z.array(z.union([z.string(), z.int(), z.boolean()])).optional(),
  description: z.string().max(300).optional(),
});

/** A deterministic check executed on a node; graders and fault verification share it. */
export const checkSpecSchema = z.strictObject({
  id: slugSchema,
  node: slugSchema,
  command: z.array(z.string()).min(1),
  /** Expectation on the command result. */
  expect: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("exit_code"), value: z.int() }),
    z.strictObject({ kind: z.literal("stdout_contains"), value: z.string().min(1) }),
    z.strictObject({ kind: z.literal("stdout_matches"), pattern: z.string().min(1) }),
    z.strictObject({
      kind: z.literal("stdout_json_equals"),
      path: z.string().min(1),
      value: z.unknown(),
    }),
  ]),
  timeout_seconds: z.int().min(1).max(600),
});
export type CheckSpec = z.infer<typeof checkSpecSchema>;

export const faultSpecSchema = z.strictObject({
  id: slugSchema,
  version: semverSchema,
  title: z.string().min(1).max(200),
  status: definitionStatusSchema,
  category: z.enum([
    "configuration",
    "routing",
    "connectivity",
    "service",
    "performance",
    "security",
    "code",
  ]),
  /** Author-only description of what breaks and why. */
  description: markdownSchema,
  requires: z.array(capabilitySchema),
  parameters: z.array(faultParameterSchema),
  /** Implementation reference on the lab worker: `module:function`, versioned with the spec. */
  inject_module: z.string().regex(/^[a-z0-9_.]+:[a-z0-9_]+$/u, "invalid-module-ref"),
  restore_module: z.string().regex(/^[a-z0-9_.]+:[a-z0-9_]+$/u, "invalid-module-ref"),
  /** Checks proving the intended failure exists (RFP §46 "verify intended failure"). */
  verify: z.array(checkSpecSchema).min(1),
  /** What the learner may observe; safe to show as symptoms, never as the fix. */
  observable_symptoms: z.array(z.string().min(1).max(300)),
  defaults: jsonObjectSchema.optional(),
});
export type FaultSpec = z.infer<typeof faultSpecSchema>;
