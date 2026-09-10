import { z } from "zod";

import { capabilitySchema } from "./capability";
import { executionClassSchema, labStatusSchema } from "./common/enums";
import {
  labSessionIdSchema,
  learnerIdSchema,
  problemInstanceIdSchema,
} from "./common/ids";
import {
  dottedIdSchema,
  jsonObjectSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  semverSchema,
  slugSchema,
  timestampSchema,
  uuidSchema,
} from "./common/primitives";

/*
 * Session transport v2 (browser or CLI ↔ session Worker), realigned to the
 * contract conventions of D-046: snake_case fields and UTC string timestamps.
 * The LabSession Durable Object is the authority; clients replay a sequenced
 * event log and address terminals by node (RFP §41: selectable nodes).
 */

export const SESSION_PROTOCOL_VERSION = 2 as const;
export const sessionProtocolVersionSchema = z.literal(SESSION_PROTOCOL_VERSION);

export const connectionIdSchema = uuidSchema;

export const MAX_PTY_CHUNK_BYTES = 16 * 1024;
export const ptyDataSchema = z.string().min(1).max(MAX_PTY_CHUNK_BYTES);
export const ptySizeSchema = z.strictObject({
  cols: z.int().min(1).max(500),
  rows: z.int().min(1).max(200),
});
export type PtySize = z.infer<typeof ptySizeSchema>;

const sequenceSchema = nonNegativeIntSchema;
const revisionSchema = nonNegativeIntSchema;

/*
 * HTTP
 */

/** `POST /session/labs`: instantiate an archetype by seed on a provider chosen by capability. */
export const createSessionRequestSchema = z.strictObject({
  archetype: dottedIdSchema,
  seed: z.int().min(0),
  /** Variation overrides; anything omitted is drawn from the seed. */
  parameters: jsonObjectSchema.optional(),
  problem_instance_id: problemInstanceIdSchema.optional(),
  /** Caps the archetype's hard TTL; never extends it. */
  ttl_minutes: positiveIntSchema.optional(),
});
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

export const sessionNodeSchema = z.strictObject({
  name: slugSchema,
  role: z.enum(["host", "router", "switch", "server", "client", "runner"]),
  /** Provider-side address once provisioned (management network). */
  address: z.string().min(1).optional(),
});

export const sessionSummarySchema = z.strictObject({
  id: labSessionIdSchema,
  learner_id: learnerIdSchema,
  status: labStatusSchema,
  archetype: dottedIdSchema,
  archetype_version: semverSchema,
  seed: z.int().min(0),
  parameters: jsonObjectSchema,
  requires: z.array(capabilitySchema).min(1),
  provider_id: slugSchema.nullable(),
  provider_class: executionClassSchema.nullable(),
  worker_id: z.string().min(1).max(120).nullable(),
  nodes: z.array(sessionNodeSchema),
  revision: revisionSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  /** Idle expiry; refreshed by learner traffic. */
  expires_at: timestampSchema.nullable(),
  /** Hard TTL from the lab spec; never refreshed. */
  hard_ttl_at: timestampSchema.nullable(),
  /** Why the session failed or was destroyed, when it has. */
  reason: z.string().max(500).nullable(),
  recording_key: z.string().min(1).nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/*
 * Events (append-only, sequenced, replayable; RFP §50 and §95)
 */
export const sessionEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("status_changed"),
    from: labStatusSchema,
    to: labStatusSchema,
    reason: z.string().max(500).optional(),
  }),
  z.strictObject({
    type: z.literal("pty_output"),
    node: slugSchema,
    data: ptyDataSchema,
  }),
  z.strictObject({
    type: z.literal("notice"),
    text: z.string().min(1).max(500),
  }),
  z.strictObject({
    type: z.literal("log"),
    level: z.enum(["debug", "info", "warn", "error"]),
    message: z.string().max(4000),
  }),
]);
export type SessionEvent = z.infer<typeof sessionEventSchema>;

export const sequencedSessionEventSchema = z.strictObject({
  sequence: sequenceSchema,
  revision: revisionSchema,
  at: timestampSchema,
  event: sessionEventSchema,
});
export type SequencedSessionEvent = z.infer<typeof sequencedSessionEventSchema>;

/*
 * WebSocket messages
 */
export const sessionRejectionCodeSchema = z.enum([
  "malformed",
  "not_owner",
  "not_ready",
  "unknown_node",
  "pty_unavailable",
  "rate_limited",
  "resync_required",
  "session_finished",
]);
export type SessionRejectionCode = z.infer<typeof sessionRejectionCodeSchema>;

const versioned = { protocol_version: sessionProtocolVersionSchema };

export const sessionClientMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...versioned,
    type: z.literal("pty_open"),
    node: slugSchema,
    size: ptySizeSchema,
  }),
  z.strictObject({
    ...versioned,
    type: z.literal("pty_input"),
    node: slugSchema,
    data: ptyDataSchema,
  }),
  z.strictObject({
    ...versioned,
    type: z.literal("pty_resize"),
    node: slugSchema,
    size: ptySizeSchema,
  }),
  z.strictObject({
    ...versioned,
    type: z.literal("resync"),
    latest_sequence: sequenceSchema,
  }),
]);
export type SessionClientMessage = z.infer<typeof sessionClientMessageSchema>;

export const sessionServerMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...versioned,
    type: z.literal("welcome"),
    session_id: labSessionIdSchema,
    connection_id: connectionIdSchema,
    server_time: timestampSchema,
  }),
  z.strictObject({
    ...versioned,
    type: z.literal("snapshot"),
    session: sessionSummarySchema,
    latest_sequence: sequenceSchema,
    recent_events: z.array(sequencedSessionEventSchema),
    server_time: timestampSchema,
  }),
  z.strictObject({
    ...versioned,
    type: z.literal("event"),
    sequence: sequenceSchema,
    revision: revisionSchema,
    at: timestampSchema,
    event: sessionEventSchema,
  }),
  /** Live terminal bytes; not sequenced and never stored in the event log (D-019). */
  z.strictObject({
    ...versioned,
    type: z.literal("pty_output"),
    node: slugSchema,
    data: ptyDataSchema,
  }),
  z.strictObject({
    ...versioned,
    type: z.literal("pty_ready"),
    node: slugSchema,
  }),
  z.strictObject({
    ...versioned,
    type: z.literal("pty_exit"),
    node: slugSchema,
    code: z.int().nullable(),
  }),
  z.strictObject({
    ...versioned,
    type: z.literal("rejected"),
    code: sessionRejectionCodeSchema,
    revision: revisionSchema,
    detail: z.string().max(500).optional(),
  }),
  z.strictObject({
    ...versioned,
    type: z.literal("resync_required"),
    reason: sessionRejectionCodeSchema,
    revision: revisionSchema,
  }),
]);
export type SessionServerMessage = z.infer<typeof sessionServerMessageSchema>;

/** WebSocket close codes shared by server and clients. */
export const SESSION_CLOSE_CODES = {
  /** Server asked the client to reconnect and take a fresh snapshot. */
  resync: 4000,
  /** The session reached a final state; do not reconnect. */
  finished: 4002,
} as const;

/*
 * Provider PTY protocol (session Worker ↔ provider). Binary frames carry raw
 * terminal bytes both ways; text frames carry these JSON control messages.
 * The Sandbox SDK terminal speaks the same shape, so one relay serves both
 * providers.
 */
export const ptyControlMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("resize"),
    cols: z.int().min(1),
    rows: z.int().min(1),
  }),
  z.strictObject({ type: z.literal("ready") }),
  z.strictObject({
    type: z.literal("exit"),
    code: z.int().nullable(),
    signal: z.string().max(20).nullable().optional(),
  }),
  z.strictObject({ type: z.literal("error"), message: z.string().max(1000) }),
]);
export type PtyControlMessage = z.infer<typeof ptyControlMessageSchema>;
