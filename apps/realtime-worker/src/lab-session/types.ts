import type { LabStatus } from "@hivemind/protocol";

export const SCHEMA_VERSION = 1;

/** Sessions with no traffic for this long are torn down (RFP §85 session expiration). */
export const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
/** How long a finished session keeps its replayable log before storage is wiped. */
export const RETENTION_AFTER_FINAL_MS = 24 * 60 * 60 * 1000;
/** Bounded event log so a chatty terminal cannot grow storage without limit. */
export const MAX_EVENTS = 2_000;
/** Events shipped with a snapshot; older ones stay replayable via resync. */
export const SNAPSHOT_EVENTS = 200;
export const MAX_TELEMETRY_ROWS = 5_000;

export type DeadlineKind = "provision_step" | "idle_expiry" | "cleanup";

export interface SessionRecord {
  readonly sessionId: string;
  readonly guestId: string;
  readonly capability: string;
  readonly problemRef: string | null;
  readonly status: LabStatus;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastActivityAt: number;
  readonly cols: number;
  readonly rows: number;
}

export interface StoredDeadline {
  readonly deadlineId: string;
  readonly kind: DeadlineKind;
  readonly dueAt: number;
  /** When set, the alarm is a no-op unless the session is still in this status. */
  readonly expectedStatus: LabStatus | null;
}

export interface SocketAttachment {
  readonly sessionId: string;
  readonly guestId: string;
  readonly connectionId: string;
}

export interface InternalCreateRequest {
  readonly sessionId: string;
  readonly guestId: string;
  readonly capability: string;
  readonly problemRef: string | null;
}
