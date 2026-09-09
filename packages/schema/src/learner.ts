import { z } from "zod";

import { executionModeSchema } from "./common/enums";
import { learnerIdSchema } from "./common/ids";
import { timestampSchema } from "./common/primitives";

/*
 * Learner record (D-001, D-008, D-033). One seeded learner exists; every
 * learner-scoped table carries `learner_id` so multi-user can be added later
 * without touching mastery or course data.
 */

/** Per-feature AI execution mode (D-009); `external` unless an API executor is configured. */
export const aiExecutionSettingsSchema = z.strictObject({
  tutor: executionModeSchema,
  review: executionModeSchema,
  interview: executionModeSchema,
  coach: executionModeSchema,
});
export type AiExecutionSettings = z.infer<typeof aiExecutionSettingsSchema>;

export const learnerSettingsSchema = z.strictObject({
  timezone: z.string().min(1).optional(),
  ai_execution: aiExecutionSettingsSchema,
  /** Shortcut overrides, `command id → key sequence`. */
  shortcuts: z.record(z.string(), z.string()).optional(),
});
export type LearnerSettings = z.infer<typeof learnerSettingsSchema>;

/** Validated identity as delivered by Cloudflare Access (D-033). */
export const accessIdentitySchema = z.strictObject({
  provider: z.literal("cloudflare_access"),
  email: z.email(),
  /** Access `sub` claim when present; email remains the stable mapping key. */
  subject: z.string().min(1).optional(),
});
export type AccessIdentity = z.infer<typeof accessIdentitySchema>;

export const learnerSchema = z.strictObject({
  id: learnerIdSchema,
  display_name: z.string().min(1).max(120),
  identity: accessIdentitySchema,
  settings: learnerSettingsSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
});
export type Learner = z.infer<typeof learnerSchema>;
