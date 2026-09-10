import { z } from "zod";

import { capabilitySchema } from "./capability";
import { labStatusSchema } from "./common/enums";
import { labSessionIdSchema } from "./common/ids";
import {
  jsonObjectSchema,
  semverSchema,
  slugSchema,
  timestampSchema,
  urlSchema,
  uuidSchema,
} from "./common/primitives";
import { graderResultSchema } from "./grader";
import {
  destroyResultSchema,
  execResultSchema,
  labSpecSchema,
  provisionResultSchema,
} from "./lab";
import { problemInstanceSchema } from "./problem";

/*
 * Worker protocol v1 between the session Worker (Durable Object) and the
 * Python lab agent (D-030, D-043). Every message travels in an envelope; the
 * payload is a discriminated union on `type`. Stage 02 implements transport;
 * Stage 01 fixes the shapes and round-trips them through generated Pydantic.
 */

export const WORKER_PROTOCOL_VERSION = 1 as const;

export const workerSenderSchema = z.strictObject({
  kind: z.enum(["session_worker", "lab_worker", "cli"]),
  id: z.string().min(1).max(120),
});

const jobBase = {
  job_id: uuidSchema,
  lab_session_id: labSessionIdSchema,
};

export const provisionJobSchema = z.strictObject({
  type: z.literal("job.provision"),
  ...jobBase,
  lab_spec: labSpecSchema,
  seed: z.int().min(0),
  problem_instance: problemInstanceSchema.optional(),
});

export const execJobSchema = z.strictObject({
  type: z.literal("job.exec"),
  ...jobBase,
  node: slugSchema,
  command: z.array(z.string()).min(1),
  timeout_seconds: z.int().min(1).max(3600),
});

export const faultInjectJobSchema = z.strictObject({
  type: z.literal("job.fault.inject"),
  ...jobBase,
  fault_id: slugSchema,
  fault_version: semverSchema,
  parameters: jsonObjectSchema,
});

export const faultVerifyJobSchema = z.strictObject({
  type: z.literal("job.fault.verify"),
  ...jobBase,
  fault_id: slugSchema,
  fault_version: semverSchema,
});

export const gradeJobSchema = z.strictObject({
  type: z.literal("job.grade"),
  ...jobBase,
  grader_id: slugSchema,
  grader_version: semverSchema,
});

export const destroyJobSchema = z.strictObject({
  type: z.literal("job.destroy"),
  ...jobBase,
  reason: z.enum(["completed", "expired", "requested", "failed", "orphaned"]),
});

export const provisionJobResultSchema = z.strictObject({
  kind: z.literal("provision"),
  result: provisionResultSchema,
});
export const execJobResultSchema = z.strictObject({
  kind: z.literal("exec"),
  result: execResultSchema,
});
export const faultJobResultSchema = z.strictObject({
  kind: z.literal("fault"),
  result: z.strictObject({
    applied: z.boolean(),
    verified: z.boolean(),
    detail: z.string().max(1000).optional(),
  }),
});
export const gradeJobResultSchema = z.strictObject({
  kind: z.literal("grade"),
  result: graderResultSchema,
});
export const destroyJobResultSchema = z.strictObject({
  kind: z.literal("destroy"),
  result: destroyResultSchema,
});

export const jobResultSchema = z.discriminatedUnion("kind", [
  provisionJobResultSchema,
  execJobResultSchema,
  faultJobResultSchema,
  gradeJobResultSchema,
  destroyJobResultSchema,
]);
export type JobResult = z.infer<typeof jobResultSchema>;

export const statusEventSchema = z.strictObject({
  type: z.literal("event.status"),
  lab_session_id: labSessionIdSchema,
  status: labStatusSchema,
  at: timestampSchema,
  detail: z.string().max(500).optional(),
});

export const logEventSchema = z.strictObject({
  type: z.literal("event.log"),
  lab_session_id: labSessionIdSchema,
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string().max(4000),
  at: timestampSchema,
});

export const resultEventSchema = z.strictObject({
  type: z.literal("event.result"),
  job_id: uuidSchema,
  lab_session_id: labSessionIdSchema,
  ok: z.boolean(),
  result: jobResultSchema,
});

export const errorEventSchema = z.strictObject({
  type: z.literal("event.error"),
  job_id: uuidSchema.optional(),
  lab_session_id: labSessionIdSchema.optional(),
  code: slugSchema,
  message: z.string().max(2000),
  retryable: z.boolean(),
});

export const heartbeatSchema = z.strictObject({
  type: z.literal("heartbeat"),
  worker_id: z.string().min(1).max(120),
  capabilities: z.array(capabilitySchema),
  active_sessions: z.int().min(0),
  load: z.strictObject({
    cpu_percent: z.number().min(0).max(100),
    memory_percent: z.number().min(0).max(100),
  }),
  runtime_versions: z.record(z.string(), z.string()),
  at: timestampSchema,
  /** Tunnel hostname the session Worker pushes jobs to (Stage 02). */
  endpoint: urlSchema.optional(),
  agent_version: semverSchema.optional(),
  hostname: z.string().max(253).optional(),
});

/*
 * Reconciliation (Stage 02 acceptance 7). On start, and whenever it suspects
 * drift, the agent reports every lab it can see on the host; the session
 * Worker answers with the sessions the objects still expect on that worker.
 * The agent destroys anything unexpected; the objects fail anything missing.
 */
export const reconcileEventSchema = z.strictObject({
  type: z.literal("event.reconcile"),
  worker_id: z.string().min(1).max(120),
  sessions: z.array(
    z.strictObject({
      lab_session_id: labSessionIdSchema,
      handle: z.string().min(1),
      nodes: z.array(slugSchema),
    }),
  ),
  at: timestampSchema,
});

export const reconcileExpectedSchema = z.strictObject({
  type: z.literal("reconcile.expected"),
  worker_id: z.string().min(1).max(120),
  sessions: z.array(
    z.strictObject({
      lab_session_id: labSessionIdSchema,
      status: labStatusSchema,
    }),
  ),
  at: timestampSchema,
});

export const workerMessageSchema = z.discriminatedUnion("type", [
  provisionJobSchema,
  execJobSchema,
  faultInjectJobSchema,
  faultVerifyJobSchema,
  gradeJobSchema,
  destroyJobSchema,
  statusEventSchema,
  logEventSchema,
  resultEventSchema,
  errorEventSchema,
  heartbeatSchema,
  reconcileEventSchema,
  reconcileExpectedSchema,
]);
export type WorkerMessage = z.infer<typeof workerMessageSchema>;

export const workerEnvelopeSchema = z.strictObject({
  protocol_version: z.literal(WORKER_PROTOCOL_VERSION),
  message_id: uuidSchema,
  correlation_id: uuidSchema.optional(),
  sent_at: timestampSchema,
  sender: workerSenderSchema,
  message: workerMessageSchema,
});
export type WorkerEnvelope = z.infer<typeof workerEnvelopeSchema>;
