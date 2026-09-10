import {
  sequencedSessionEventSchema,
  type SequencedSessionEvent,
} from "@hivemind/schema";

import { allRows, type Database } from "./index";

/*
 * Durable session event log (Stage 02). The Durable Object appends lifecycle
 * transitions, notices, and provider log lines here as they happen; PTY
 * output never lands in D1 (recordings go to R2). Rows are append-only and
 * keyed by (session, sequence) so replays are idempotent.
 */

export interface LabSessionEventRow {
  readonly lab_session_id: string;
  readonly event: SequencedSessionEvent;
}

interface EventRow {
  lab_session_id: string;
  sequence: number;
  revision: number;
  at: string;
  event_json: string;
}

function toRow(row: EventRow): LabSessionEventRow {
  return {
    lab_session_id: row.lab_session_id,
    event: sequencedSessionEventSchema.parse({
      sequence: row.sequence,
      revision: row.revision,
      at: row.at,
      event: JSON.parse(row.event_json) as unknown,
    }),
  };
}

export class LabSessionEventRepository {
  constructor(private readonly db: Database) {}

  async append(labSessionId: string, event: SequencedSessionEvent): Promise<void> {
    const parsed = sequencedSessionEventSchema.parse(event);
    if (parsed.event.type === "pty_output") {
      throw new Error("terminal output is never stored in D1 (D-019)");
    }
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO lab_session_events (lab_session_id, sequence, revision, at, kind, event_json) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        labSessionId,
        parsed.sequence,
        parsed.revision,
        parsed.at,
        parsed.event.type,
        JSON.stringify(parsed.event),
      )
      .run();
  }

  async listForSession(labSessionId: string, limit = 500): Promise<LabSessionEventRow[]> {
    const rows = await allRows<EventRow>(
      this.db
        .prepare(
          "SELECT lab_session_id, sequence, revision, at, event_json FROM lab_session_events WHERE lab_session_id = ? ORDER BY sequence ASC LIMIT ?",
        )
        .bind(labSessionId, limit),
    );
    return rows.map(toRow);
  }

  /** Newest events across sessions (Infrastructure console "Logs & Events"). */
  async listRecent(limit = 50): Promise<LabSessionEventRow[]> {
    const rows = await allRows<EventRow>(
      this.db
        .prepare(
          "SELECT lab_session_id, sequence, revision, at, event_json FROM lab_session_events ORDER BY at DESC, sequence DESC LIMIT ?",
        )
        .bind(limit),
    );
    return rows.map(toRow);
  }
}
