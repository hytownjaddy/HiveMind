import type {
  ExecutionClass,
  LabProviderDescriptor,
  LabSpec,
  LabStatus,
  TopologyInstance,
} from "@hivemind/schema";

export type NodeRole = LabSpec["nodes"][number]["role"];
export interface SessionNode {
  readonly name: string;
  readonly role: NodeRole;
  readonly address?: string;
}

export const SCHEMA_VERSION = 3; // 3: Stage 02 provider model (topology, nodes, recordings)

/** Sessions with no learner traffic for this long are torn down (RFP §85). */
export const IDLE_TTL_MS = 2 * 60 * 60 * 1000;
/** How long a finished session keeps its replayable log before storage is wiped. */
export const RETENTION_AFTER_FINAL_MS = 24 * 60 * 60 * 1000;
/** Bounded durable event log; PTY bytes never enter it. */
export const MAX_EVENTS = 2_000;
export const SNAPSHOT_EVENTS = 200;
export const MAX_TELEMETRY_ROWS = 5_000;
/** Per-node recording frames kept in SQLite before the oldest are dropped. */
export const MAX_RECORDING_FRAMES = 60_000;
/** Raw scrollback kept in memory per node so a `pty_open` can repaint. */
export const SCROLLBACK_CHARS = 64 * 1024;

export type DeadlineKind =
  | "provision_start"
  | "job_timeout"
  | "idle_expiry"
  | "hard_ttl"
  | "destroy_timeout"
  | "cleanup";

export interface SessionRecord {
  readonly sessionId: string;
  readonly learnerId: string;
  readonly status: LabStatus;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastActivityAt: number;
  readonly hardTtlAt: number;
  readonly topology: TopologyInstance;
  readonly provider: LabProviderDescriptor;
  readonly providerClass: ExecutionClass;
  readonly workerId: string | null;
  readonly nodes: readonly SessionNode[];
  readonly handle: string | null;
  readonly reason: string | null;
  readonly recordingKeys: Readonly<Record<string, string>>;
  readonly problemInstanceId: string | null;
  readonly currentJobId: string | null;
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
  readonly learnerId: string;
  readonly connectionId: string;
}

export interface InternalCreateRequest {
  readonly sessionId: string;
  readonly learnerId: string;
  readonly topology: TopologyInstance;
  readonly provider: LabProviderDescriptor;
  readonly providerClass: ExecutionClass;
  readonly workerId: string | null;
  readonly hardTtlMinutes: number;
  readonly problemInstanceId: string | null;
}

export interface RecordingFrameRow {
  readonly node: string;
  readonly at_ms: number;
  readonly kind: "o" | "i" | "r";
  readonly data: string;
}
