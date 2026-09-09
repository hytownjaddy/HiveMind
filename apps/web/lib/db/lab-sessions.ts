import type { LabSessionSummary, LabStatus } from "@hivemind/schema";

import { getDb } from "./client";

export interface LabSessionRow {
  readonly id: string;
  readonly capability: string;
  readonly problemRef: string | null;
  readonly status: LabStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface RawRow {
  id: string;
  capability: string;
  problem_ref: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: RawRow): LabSessionRow {
  return {
    id: row.id,
    capability: row.capability,
    problemRef: row.problem_ref,
    status: row.status as LabStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertLabSession(
  guestId: string,
  summary: LabSessionSummary,
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO lab_sessions (id, guest_id, capability, problem_ref, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         updated_at = excluded.updated_at`,
    )
    .bind(
      summary.sessionId,
      guestId,
      summary.capability,
      summary.problemRef,
      summary.status,
      new Date(summary.createdAt).toISOString(),
      new Date(summary.updatedAt).toISOString(),
    )
    .run();
}

export async function updateLabSessionStatus(
  guestId: string,
  sessionId: string,
  status: LabStatus,
): Promise<void> {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE lab_sessions SET status = ?, updated_at = ? WHERE id = ? AND guest_id = ?`,
    )
    .bind(status, new Date().toISOString(), sessionId, guestId)
    .run();
}

export async function listLabSessionsForGuest(
  guestId: string,
  limit = 10,
): Promise<LabSessionRow[]> {
  const db = await getDb();
  const result = await db
    .prepare(
      `SELECT id, capability, problem_ref, status, created_at, updated_at
       FROM lab_sessions WHERE guest_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(guestId, limit)
    .all<RawRow>();
  return result.results.map(mapRow);
}
