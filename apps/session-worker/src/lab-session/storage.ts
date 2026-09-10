import { isoNow } from "@hivemind/core";
import {
  labProviderDescriptorSchema,
  sessionEventSchema,
  topologyInstanceSchema,
  type ExecutionClass,
  type LabStatus,
  type SequencedSessionEvent,
  type SessionEvent,
  type SessionSummary,
} from "@hivemind/schema";

import {
  IDLE_TTL_MS,
  MAX_EVENTS,
  MAX_RECORDING_FRAMES,
  MAX_TELEMETRY_ROWS,
  SCHEMA_VERSION,
  type DeadlineKind,
  type InternalCreateRequest,
  type RecordingFrameRow,
  type SessionRecord,
  type StoredDeadline,
} from "./types";

interface SessionRow {
  [key: string]: SqlStorageValue;
  session_id: string;
  learner_id: string;
  status: string;
  schema_version: number;
  revision: number;
  created_at: number;
  updated_at: number;
  last_activity_at: number;
  hard_ttl_at: number;
  topology_json: string;
  provider_json: string;
  provider_class: string;
  worker_id: string | null;
  nodes_json: string;
  handle: string | null;
  reason: string | null;
  recording_keys_json: string;
  problem_instance_id: string | null;
  current_job_id: string | null;
}

interface EventRow {
  [key: string]: SqlStorageValue;
  sequence: number;
  revision: number;
  created_at: number;
  event_json: string;
}

interface DeadlineRow {
  [key: string]: SqlStorageValue;
  deadline_id: string;
  kind: string;
  due_at: number;
  expected_status: string | null;
}

interface NumberRow {
  [key: string]: SqlStorageValue;
  value: number;
}

interface FrameRow {
  [key: string]: SqlStorageValue;
  node: string;
  at_ms: number;
  kind: string;
  data: string;
}

interface SizeRow {
  [key: string]: SqlStorageValue;
  node: string;
  cols: number;
  rows: number;
}

export function iso(ms: number): string {
  return isoNow(new Date(ms));
}

/**
 * Embedded SQLite persistence for one LabSession. SQLite is authoritative after
 * hibernation or restart; nothing important lives only in memory. Recording
 * frames are stored already redacted (D-019).
 */
export class LabSessionRepository {
  constructor(private readonly storage: DurableObjectStorage) {}

  private get sql(): SqlStorage {
    return this.storage.sql;
  }

  ensureSchema(): void {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS session (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        session_id TEXT NOT NULL,
        learner_id TEXT NOT NULL,
        status TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        hard_ttl_at INTEGER NOT NULL,
        topology_json TEXT NOT NULL,
        provider_json TEXT NOT NULL,
        provider_class TEXT NOT NULL,
        worker_id TEXT,
        nodes_json TEXT NOT NULL,
        handle TEXT,
        reason TEXT,
        recording_keys_json TEXT NOT NULL DEFAULT '{}',
        problem_instance_id TEXT,
        current_job_id TEXT
      )`);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        revision INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        event_json TEXT NOT NULL
      )`);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL
      )`);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS deadlines (
        deadline_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        due_at INTEGER NOT NULL,
        expected_status TEXT
      )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS idx_deadlines_due ON deadlines (due_at)`);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS recording_frames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node TEXT NOT NULL,
        at_ms INTEGER NOT NULL,
        kind TEXT NOT NULL,
        data TEXT NOT NULL
      )`);
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_frames_node ON recording_frames (node, id)`,
    );
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS pty_sizes (
        node TEXT PRIMARY KEY,
        cols INTEGER NOT NULL,
        rows INTEGER NOT NULL
      )`);
  }

  /* ---------------------------------------------------------------- session */

  load(): SessionRecord | null {
    const row = this.sql
      .exec<SessionRow>("SELECT * FROM session WHERE id = 1")
      .toArray()[0];
    if (row === undefined) {
      return null;
    }
    return {
      sessionId: row.session_id,
      learnerId: row.learner_id,
      status: row.status as LabStatus,
      schemaVersion: row.schema_version,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_activity_at,
      hardTtlAt: row.hard_ttl_at,
      topology: topologyInstanceSchema.parse(JSON.parse(row.topology_json)),
      provider: labProviderDescriptorSchema.parse(JSON.parse(row.provider_json)),
      providerClass: row.provider_class as ExecutionClass,
      workerId: row.worker_id,
      nodes: JSON.parse(row.nodes_json) as SessionRecord["nodes"],
      handle: row.handle,
      reason: row.reason,
      recordingKeys: JSON.parse(row.recording_keys_json) as Record<string, string>,
      problemInstanceId: row.problem_instance_id,
      currentJobId: row.current_job_id,
    };
  }

  create(request: InternalCreateRequest, now: number): SessionRecord {
    const nodes = request.topology.lab_spec.nodes.map((node) => ({
      name: node.name,
      role: node.role,
    }));
    this.sql.exec(
      `INSERT INTO session (
         id, session_id, learner_id, status, schema_version, revision, created_at, updated_at,
         last_activity_at, hard_ttl_at, topology_json, provider_json, provider_class, worker_id,
         nodes_json, handle, reason, recording_keys_json, problem_instance_id, current_job_id
       ) VALUES (1, ?, ?, 'queued', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '{}', ?, NULL)`,
      request.sessionId,
      request.learnerId,
      SCHEMA_VERSION,
      now,
      now,
      now,
      now + request.hardTtlMinutes * 60_000,
      JSON.stringify(request.topology),
      JSON.stringify(request.provider),
      request.providerClass,
      request.workerId,
      JSON.stringify(nodes),
      request.problemInstanceId,
    );
    const created = this.load();
    if (created === null) {
      throw new Error("session-insert-failed");
    }
    return created;
  }

  recordActivity(now: number): void {
    this.sql.exec("UPDATE session SET last_activity_at = ? WHERE id = 1", now);
  }

  private bumpRevision(now: number): number {
    this.sql.exec(
      "UPDATE session SET revision = revision + 1, updated_at = ?, last_activity_at = ? WHERE id = 1",
      now,
      now,
    );
    return this.sql
      .exec<NumberRow>("SELECT revision AS value FROM session WHERE id = 1")
      .one().value;
  }

  setStatus(status: LabStatus, now: number, reason?: string | null): number {
    if (reason === undefined) {
      this.sql.exec("UPDATE session SET status = ? WHERE id = 1", status);
    } else {
      this.sql.exec(
        "UPDATE session SET status = ?, reason = ? WHERE id = 1",
        status,
        reason,
      );
    }
    return this.bumpRevision(now);
  }

  setNodes(nodes: SessionRecord["nodes"], handle: string | null): void {
    this.sql.exec(
      "UPDATE session SET nodes_json = ?, handle = ? WHERE id = 1",
      JSON.stringify(nodes),
      handle,
    );
  }

  setJob(jobId: string | null): void {
    this.sql.exec("UPDATE session SET current_job_id = ? WHERE id = 1", jobId);
  }

  setRecordingKeys(keys: Readonly<Record<string, string>>): void {
    this.sql.exec(
      "UPDATE session SET recording_keys_json = ? WHERE id = 1",
      JSON.stringify(keys),
    );
  }

  summary(record: SessionRecord): SessionSummary {
    const idle = this.getDeadlineByKind("idle_expiry");
    return {
      id: record.sessionId,
      learner_id: record.learnerId,
      status: record.status,
      archetype: record.topology.archetype_id,
      archetype_version: record.topology.archetype_version,
      seed: record.topology.seed,
      parameters: record.topology.parameters,
      requires: [...record.topology.lab_spec.requires],
      provider_id: record.provider.id,
      provider_class: record.providerClass,
      worker_id: record.workerId,
      nodes: record.nodes.map((node) => ({
        name: node.name,
        role: node.role,
        ...(node.address === undefined ? {} : { address: node.address }),
      })),
      revision: record.revision,
      created_at: iso(record.createdAt),
      updated_at: iso(record.updatedAt),
      expires_at: idle === null ? null : iso(idle.dueAt),
      hard_ttl_at: iso(record.hardTtlAt),
      reason: record.reason,
      recording_key: Object.values(record.recordingKeys)[0] ?? null,
    };
  }

  /* ----------------------------------------------------------------- events */

  appendEvent(revision: number, event: SessionEvent, now: number): SequencedSessionEvent {
    const eventJson = JSON.stringify(sessionEventSchema.parse(event));
    const { value: sequence } = this.sql
      .exec<NumberRow>(
        "INSERT INTO events (revision, created_at, event_json) VALUES (?, ?, ?) RETURNING sequence AS value",
        revision,
        now,
        eventJson,
      )
      .one();
    this.sql.exec(
      `DELETE FROM events WHERE sequence <= (
         SELECT sequence FROM events ORDER BY sequence DESC LIMIT 1 OFFSET ?
       )`,
      MAX_EVENTS,
    );
    return { sequence, revision, at: iso(now), event };
  }

  latestSequence(): number {
    return this.sql
      .exec<NumberRow>("SELECT COALESCE(MAX(sequence), 0) AS value FROM events")
      .one().value;
  }

  listRecentEvents(limit: number): SequencedSessionEvent[] {
    return this.sql
      .exec<EventRow>("SELECT * FROM events ORDER BY sequence DESC LIMIT ?", limit)
      .toArray()
      .reverse()
      .map(rowToEvent);
  }

  listEventsAfter(sequence: number, limit: number): SequencedSessionEvent[] {
    return this.sql
      .exec<EventRow>(
        "SELECT * FROM events WHERE sequence > ? ORDER BY sequence ASC LIMIT ?",
        sequence,
        limit,
      )
      .toArray()
      .map(rowToEvent);
  }

  /* -------------------------------------------------------------- telemetry */

  recordTelemetry(kind: string, payload: unknown, now: number): void {
    this.sql.exec(
      "INSERT INTO telemetry (created_at, kind, payload_json) VALUES (?, ?, ?)",
      now,
      kind,
      JSON.stringify(payload),
    );
    this.sql.exec(
      `DELETE FROM telemetry WHERE id <= (
         SELECT id FROM telemetry ORDER BY id DESC LIMIT 1 OFFSET ?
       )`,
      MAX_TELEMETRY_ROWS,
    );
  }

  /* ------------------------------------------------------------- recordings */

  appendFrame(frame: RecordingFrameRow): void {
    this.sql.exec(
      "INSERT INTO recording_frames (node, at_ms, kind, data) VALUES (?, ?, ?, ?)",
      frame.node,
      frame.at_ms,
      frame.kind,
      frame.data,
    );
    this.sql.exec(
      `DELETE FROM recording_frames WHERE node = ? AND id <= (
         SELECT id FROM recording_frames WHERE node = ? ORDER BY id DESC LIMIT 1 OFFSET ?
       )`,
      frame.node,
      frame.node,
      MAX_RECORDING_FRAMES,
    );
  }

  listFrames(node: string): RecordingFrameRow[] {
    return this.sql
      .exec<FrameRow>(
        "SELECT node, at_ms, kind, data FROM recording_frames WHERE node = ? ORDER BY id ASC",
        node,
      )
      .toArray()
      .map((row) => ({
        node: row.node,
        at_ms: row.at_ms,
        kind: row.kind as RecordingFrameRow["kind"],
        data: row.data,
      }));
  }

  recordedNodes(): string[] {
    return this.sql
      .exec<{ [key: string]: SqlStorageValue; node: string }>(
        "SELECT DISTINCT node FROM recording_frames ORDER BY node",
      )
      .toArray()
      .map((row) => row.node);
  }

  setPtySize(node: string, cols: number, rows: number): void {
    this.sql.exec(
      "INSERT INTO pty_sizes (node, cols, rows) VALUES (?, ?, ?) ON CONFLICT(node) DO UPDATE SET cols = excluded.cols, rows = excluded.rows",
      node,
      cols,
      rows,
    );
  }

  ptySize(node: string): { cols: number; rows: number } {
    const row = this.sql
      .exec<SizeRow>("SELECT * FROM pty_sizes WHERE node = ?", node)
      .toArray()[0];
    return row === undefined
      ? { cols: 80, rows: 24 }
      : { cols: row.cols, rows: row.rows };
  }

  /* -------------------------------------------------------------- deadlines */

  scheduleDeadline(deadline: StoredDeadline): void {
    this.sql.exec(
      `INSERT INTO deadlines (deadline_id, kind, due_at, expected_status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(deadline_id) DO UPDATE SET
         kind = excluded.kind,
         due_at = excluded.due_at,
         expected_status = excluded.expected_status`,
      deadline.deadlineId,
      deadline.kind,
      deadline.dueAt,
      deadline.expectedStatus,
    );
  }

  scheduleIdleExpiry(now: number): void {
    this.scheduleDeadline({
      deadlineId: "idle-expiry",
      kind: "idle_expiry",
      dueAt: now + IDLE_TTL_MS,
      expectedStatus: null,
    });
  }

  removeDeadline(deadlineId: string): void {
    this.sql.exec("DELETE FROM deadlines WHERE deadline_id = ?", deadlineId);
  }

  clearDeadlines(): void {
    this.sql.exec("DELETE FROM deadlines");
  }

  /** Tests only: bring one deadline kind forward so the next alarm consumes it. */
  expireDeadlines(kind: string): void {
    this.sql.exec("UPDATE deadlines SET due_at = 0 WHERE kind = ?", kind);
  }

  getDeadlineByKind(kind: DeadlineKind): StoredDeadline | null {
    const row = this.sql
      .exec<DeadlineRow>("SELECT * FROM deadlines WHERE kind = ? LIMIT 1", kind)
      .toArray()[0];
    return row === undefined ? null : rowToDeadline(row);
  }

  nextDeadline(): StoredDeadline | null {
    const row = this.sql
      .exec<DeadlineRow>("SELECT * FROM deadlines ORDER BY due_at ASC LIMIT 1")
      .toArray()[0];
    return row === undefined ? null : rowToDeadline(row);
  }

  /** A Durable Object has one alarm; always point it at the earliest deadline. */
  async syncAlarm(): Promise<void> {
    const next = this.nextDeadline();
    if (next === null) {
      await this.storage.deleteAlarm();
    } else {
      await this.storage.setAlarm(next.dueAt);
    }
  }

  async destroyAll(): Promise<void> {
    await this.storage.deleteAlarm();
    await this.storage.deleteAll();
  }
}

function rowToEvent(row: EventRow): SequencedSessionEvent {
  return {
    sequence: row.sequence,
    revision: row.revision,
    at: iso(row.created_at),
    event: sessionEventSchema.parse(JSON.parse(row.event_json)),
  };
}

function rowToDeadline(row: DeadlineRow): StoredDeadline {
  return {
    deadlineId: row.deadline_id,
    kind: row.kind as DeadlineKind,
    dueAt: row.due_at,
    expectedStatus: row.expected_status as LabStatus | null,
  };
}
