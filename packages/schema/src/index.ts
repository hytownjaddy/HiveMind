export * from "./common/primitives";
export * from "./common/ids";
export * from "./common/enums";
export * from "./common/versioning";
export * from "./learner";
export * from "./skills";
export * from "./sources";
export * from "./lesson-body";
export * from "./content";
export * from "./capability";
export * from "./lab";
export * from "./fault";
export * from "./grader";
export * from "./problem";
export * from "./attempt";
export * from "./career";
export * from "./work-order";
export * from "./worker-protocol";
export * from "./contracts";

// Session transport v1 (scaffold wire format; realigned in Stage 02).
export {
  CLOSE_CODES,
  MAX_TERMINAL_CHUNK_BYTES,
  connectionIdSchema,
  createLabSessionRequestSchema,
  guestIdSchema,
  labCapabilitySchema,
  labClientMessageSchema,
  labEventSchema,
  labRejectionCodeSchema,
  labServerMessageSchema,
  labSessionSummarySchema,
  problemRefSchema,
  sequencedLabEventSchema,
  terminalDataSchema,
  terminalSizeSchema,
  type CreateLabSessionRequest,
  type GuestId,
  type LabCapability,
  type LabClientMessage,
  type LabEvent,
  type LabRejectionCode,
  type LabServerMessage,
  type LabSessionSummary,
  type SequencedLabEvent,
} from "./lab-session";
export { PROTOCOL_VERSION, protocolVersionSchema, type ProtocolVersion } from "./version";

// Guest HMAC sessions: removed with the Access integration (Stage 01, task 8).
export {
  GUEST_SESSION_COOKIE,
  GUEST_SESSION_TTL_MS,
  MIN_SECRET_BYTES,
  isUsableSecret,
  issueGuestSession,
  readCookie,
  signGuestSession,
  verifyGuestSession,
  type GuestSession,
} from "./guest-session";
