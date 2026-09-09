import {
  labEventSchema,
  type LabEvent,
  type LabSessionSummary,
  type LabStatus,
  type SequencedLabEvent,
} from "@hivemind/schema";

import {
  IDLE_TTL_MS,
  MAX_EVENTS,
  MAX_TELEMETRY_ROWS,
  SCHEMA_VERSION,
  type DeadlineKind,
  type InternalCreateRequest,
  type SessionRecord,
  type StoredDeadline,
} from "./types";

interface SessionRow {
  [key: string]: SqlStorageValue;
  session_id: string;
  learner_id: string;
  capability: string;
  problem_ref: string | null;
  status: string;
  schema_version: number;
  revision: number;
  created_at: number;
  updated_at: number;
  last_activity_at: number;
  cols: number;
  rows: number;
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

/**
 * Embedded SQLite persistence for one LabSession. SQLite is authoritative after
 * hibernation or restart; nothing important lives only in memory.
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
        capability TEXT NOT NULL,
        problem_ref TEXT,
        status TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_activity_at INTEGER NOT NULL,
        cols INTEGER NOT NULL DEFAULT 80,
        rows INTEGER NOT NULL DEFAULT 24
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
      capability: row.capability,
      problemRef: row.problem_ref,
      status: row.status as LabStatus,
      schemaVersion: row.schema_version,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastActivityAt: row.last_activity_at,
      cols: row.cols,
      rows: row.rows,
    };
  }

  create(request: InternalCreateRequest, now: number): SessionRecord {
    this.sql.exec(
      `INSERT INTO session (
         id, session_id, learner_id, capability, problem_ref, status, schema_version,
         revision, created_at, updated_at, last_activity_at
       ) VALUES (1, ?, ?, ?, ?, 'queued', ?, 0, ?, ?, ?)`,
      request.sessionId,
      request.learnerId,
      request.capability,
      request.problemRef,
      SCHEMA_VERSION,
      now,
      now,
      now,
    );
    const created = this.load();
    if (created === null) {
      throw new Error("session-insert-failed");
    }
    return created;
  }

  /** Learner traffic that does not change session state. */
  recordActivity(now: number): void {
    this.sql.exec("UPDATE session SET last_activity_at = ? WHERE id = 1", now);
  }

  /** Bump the revision for a state change; returns the new revision. */
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

  setStatus(status: LabStatus, now: number): number {
    this.sql.exec("UPDATE session SET status = ? WHERE id = 1", status);
    return this.bumpRevision(now);
  }

  setTerminalSize(cols: number, rows: number): void {
    this.sql.exec("UPDATE session SET cols = ?, rows = ? WHERE id = 1", cols, rows);
  }

  summary(record: SessionRecord): LabSessionSummary {
    const idle = this.getDeadlineByKind("idle_expiry");
    return {
      sessionId: record.sessionId,
      status: record.status,
      capability: record.capability,
      problemRef: record.problemRef,
      revision: record.revision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      expiresAt: idle?.dueAt ?? null,
    };
  }

  /* ----------------------------------------------------------------- events */

  appendEvent(revision: number, event: LabEvent, now: number): SequencedLabEvent {
    const eventJson = JSON.stringify(labEventSchema.parse(event));
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
    return { sequence, revision, at: now, event };
  }

  latestSequence(): number {
    return this.sql
      .exec<NumberRow>("SELECT COALESCE(MAX(sequence), 0) AS value FROM events")
      .one().value;
  }

  listRecentEvents(limit: number): SequencedLabEvent[] {
    return this.sql
      .exec<EventRow>("SELECT * FROM events ORDER BY sequence DESC LIMIT ?", limit)
      .toArray()
      .reverse()
      .map(rowToEvent);
  }

  listEventsAfter(sequence: number, limit: number): SequencedLabEvent[] {
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

  /** Learner-side actions kept for replay and methodology scoring (RFP §49-50). */
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

  telemetryCount(): number {
    return this.sql.exec<NumberRow>("SELECT COUNT(*) AS value FROM telemetry").one()
      .value;
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

function rowToEvent(row: EventRow): SequencedLabEvent {
  return {
    sequence: row.sequence,
    revision: row.revision,
    at: row.created_at,
    event: labEventSchema.parse(JSON.parse(row.event_json)),
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
