import { z } from "zod";

import { capabilitySchema } from "./capability";
import { semverSchema, timestampSchema, urlSchema } from "./common/primitives";

/*
 * Lab worker registry (Stage 02, D-030). A worker registers by heartbeat; the
 * session Worker keeps this record in D1 and the Infrastructure console
 * renders it. `online` flips to `degraded` after one missed heartbeat window
 * and `offline` after three (packages/core owns the rule).
 */

export const labWorkerStatusSchema = z.enum(["online", "degraded", "offline"]);
export type LabWorkerStatus = z.infer<typeof labWorkerStatusSchema>;

export const labWorkerSchema = z.strictObject({
  id: z.string().min(1).max(120),
  status: labWorkerStatusSchema,
  capabilities: z.array(capabilitySchema),
  /** Tunnel hostname the session Worker pushes jobs to. */
  endpoint: urlSchema.nullable(),
  agent_version: semverSchema.nullable(),
  hostname: z.string().max(253).nullable(),
  runtime_versions: z.record(z.string(), z.string()),
  load: z.strictObject({
    cpu_percent: z.number().min(0).max(100),
    memory_percent: z.number().min(0).max(100),
  }),
  active_sessions: z.int().min(0),
  registered_at: timestampSchema,
  last_heartbeat_at: timestampSchema,
});
export type LabWorker = z.infer<typeof labWorkerSchema>;
