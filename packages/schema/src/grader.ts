import { z } from "zod";

import { capabilitySchema } from "./capability";
import { definitionStatusSchema } from "./common/enums";
import {
  semverSchema,
  slugSchema,
  timestampSchema,
  unitScoreSchema,
} from "./common/primitives";
import { checkSpecSchema } from "./fault";

/*
 * Grader manifest and result (invariants 3, 8). Graders are deterministic
 * code on the lab worker (or the Sandbox test runner); AI never decides
 * technical correctness (D-015).
 */

export const graderCheckSchema = z.strictObject({
  id: slugSchema,
  description: z.string().min(1).max(300),
  weight: z.number().min(0),
  /** Objective this check evidences; several checks may serve one objective. */
  objective_id: slugSchema.optional(),
  /** Hidden checks never reveal their name or body to the learner (UI-SYSTEM §10). */
  hidden: z.boolean(),
  spec: checkSpecSchema.optional(),
});
export type GraderCheck = z.infer<typeof graderCheckSchema>;

export const graderManifestSchema = z.strictObject({
  id: slugSchema,
  version: semverSchema,
  title: z.string().min(1).max(200),
  status: definitionStatusSchema,
  kind: z.enum(["deterministic", "test_runner"]),
  requires: z.array(capabilitySchema),
  checks: z.array(graderCheckSchema).min(1),
  /** Implementation reference on the worker, versioned with the manifest. */
  entrypoint: z.string().regex(/^[a-z0-9_.]+:[a-z0-9_]+$/u, "invalid-module-ref"),
  timeout_seconds: z.int().min(1).max(3600),
});
export type GraderManifest = z.infer<typeof graderManifestSchema>;

export const graderCheckResultSchema = z.strictObject({
  id: slugSchema,
  passed: z.boolean(),
  weight: z.number().min(0),
  /** Learner-safe message; hidden checks get a generic one. */
  message: z.string().max(500).optional(),
  /** Raw evidence kept for review; redacted before storage. */
  evidence: z.string().max(4000).optional(),
});

export const graderResultSchema = z.strictObject({
  grader_id: slugSchema,
  grader_version: semverSchema,
  status: z.enum(["passed", "failed", "error"]),
  score: unitScoreSchema,
  checks: z.array(graderCheckResultSchema),
  started_at: timestampSchema,
  finished_at: timestampSchema,
  /** R2 key of the full log, when kept. */
  logs_ref: z.string().min(1).optional(),
  error: z.string().max(1000).optional(),
});
export type GraderResult = z.infer<typeof graderResultSchema>;
