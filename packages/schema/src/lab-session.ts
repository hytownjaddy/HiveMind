import { z } from "zod";

import { capabilitySchema } from "./capability";
import { labStatusSchema } from "./common/enums";
import { labSessionIdSchema } from "./common/ids";
import { protocolVersionSchema } from "./version";

/*
 * Session transport v1 (browser ↔ session Worker). Lifecycle, identifiers,
 * and capabilities come from the canonical contracts; this file keeps the
 * scaffold's camelCase wire format until Stage 02 refactors the LabSession
 * object to the capability/provider model.
 */
export {
  FINAL_STATUSES,
  LAB_STATUSES,
  TERMINAL_STATUSES,
  labStatusSchema,
} from "./common/enums";
export type { LabStatus } from "./common/enums";
export { labSessionIdSchema } from "./common/ids";
export type { LabSessionId } from "./common/ids";

/*
 * Identifiers
 */
export const guestIdSchema = z.uuid();
export type GuestId = z.infer<typeof guestIdSchema>;

export const connectionIdSchema = z.uuid();

/** Capability id (D-035); alias of the canonical `capabilitySchema`. */
export const labCapabilitySchema = capabilitySchema;
export type LabCapability = z.infer<typeof labCapabilitySchema>;

/** Opaque reference to a validated problem instance (RFP §47), e.g. `bgp.next_hop#42`. */
export const problemRefSchema = z.string().trim().min(1).max(128);

const revisionSchema = z.int().nonnegative();
const sequenceSchema = z.int().nonnegative();
const timestampSchema = z.int().nonnegative();

export const MAX_TERMINAL_CHUNK_BYTES = 16 * 1024;
export const terminalDataSchema = z.string().min(1).max(MAX_TERMINAL_CHUNK_BYTES);
export const terminalSizeSchema = z.strictObject({
  cols: z.int().min(1).max(500),
  rows: z.int().min(1).max(200),
});

/*
 * HTTP contracts (gateway)
 */
export const createLabSessionRequestSchema = z.strictObject({
  capability: labCapabilitySchema,
  problemRef: problemRefSchema.optional(),
});
export type CreateLabSessionRequest = z.infer<typeof createLabSessionRequestSchema>;

export const labSessionSummarySchema = z.strictObject({
  sessionId: labSessionIdSchema,
  status: labStatusSchema,
  capability: labCapabilitySchema,
  problemRef: problemRefSchema.nullable(),
  revision: revisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  expiresAt: timestampSchema.nullable(),
});
export type LabSessionSummary = z.infer<typeof labSessionSummarySchema>;

/*
 * Events (append-only, sequenced, replayable; RFP §50 and §95)
 */
export const labEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("status_changed"),
    from: labStatusSchema,
    to: labStatusSchema,
    reason: z.string().max(200).optional(),
  }),
  z.strictObject({
    type: z.literal("terminal_output"),
    data: terminalDataSchema,
  }),
  z.strictObject({
    type: z.literal("notice"),
    text: z.string().min(1).max(500),
  }),
]);
export type LabEvent = z.infer<typeof labEventSchema>;

export const sequencedLabEventSchema = z.strictObject({
  sequence: sequenceSchema,
  revision: revisionSchema,
  at: timestampSchema,
  event: labEventSchema,
});
export type SequencedLabEvent = z.infer<typeof sequencedLabEventSchema>;

/*
 * WebSocket messages
 */
export const labRejectionCodeSchema = z.enum([
  "malformed",
  "not-owner",
  "not-ready",
  "rate-limited",
  "resync-required",
  "session-finished",
]);
export type LabRejectionCode = z.infer<typeof labRejectionCodeSchema>;

export const labClientMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    protocolVersion: protocolVersionSchema,
    type: z.literal("terminal_input"),
    data: terminalDataSchema,
  }),
  z.strictObject({
    protocolVersion: protocolVersionSchema,
    type: z.literal("terminal_resize"),
    size: terminalSizeSchema,
  }),
  z.strictObject({
    protocolVersion: protocolVersionSchema,
    type: z.literal("resync"),
    latestSequence: sequenceSchema,
  }),
]);
export type LabClientMessage = z.infer<typeof labClientMessageSchema>;

export const labServerMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    protocolVersion: protocolVersionSchema,
    type: z.literal("welcome"),
    sessionId: labSessionIdSchema,
    connectionId: connectionIdSchema,
    serverTime: timestampSchema,
  }),
  z.strictObject({
    protocolVersion: protocolVersionSchema,
    type: z.literal("snapshot"),
    session: labSessionSummarySchema,
    latestSequence: sequenceSchema,
    recentEvents: z.array(sequencedLabEventSchema),
    serverTime: timestampSchema,
  }),
  z.strictObject({
    protocolVersion: protocolVersionSchema,
    type: z.literal("event"),
    sequence: sequenceSchema,
    revision: revisionSchema,
    at: timestampSchema,
    event: labEventSchema,
  }),
  z.strictObject({
    protocolVersion: protocolVersionSchema,
    type: z.literal("rejected"),
    code: labRejectionCodeSchema,
    revision: revisionSchema,
  }),
  z.strictObject({
    protocolVersion: protocolVersionSchema,
    type: z.literal("resync_required"),
    reason: labRejectionCodeSchema,
    revision: revisionSchema,
  }),
]);
export type LabServerMessage = z.infer<typeof labServerMessageSchema>;

/** WebSocket close codes shared by server and client. */
export const CLOSE_CODES = {
  /** Server asked the client to reconnect and take a fresh snapshot. */
  resync: 4000,
  /** The session reached a final state; do not reconnect. */
  finished: 4002,
} as const;
