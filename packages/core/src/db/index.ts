/*
 * D1 access layer (D-030, D-031). Repositories are thin, typed wrappers over
 * prepared statements; JSON columns hold canonical contract documents and are
 * parsed through their Zod schema on read so callers never see drift.
 */

export type Database = D1Database;

export interface Clock {
  now(): string;
}

/** UTC timestamp without milliseconds, matching `timestampSchema`. */
export function isoNow(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

export const systemClock: Clock = { now: () => isoNow() };

export function parseJsonColumn<T>(value: string, parse: (input: unknown) => T): T {
  return parse(JSON.parse(value) as unknown);
}

export async function allRows<T>(statement: D1PreparedStatement): Promise<T[]> {
  const { results } = await statement.all<T>();
  return results;
}

/**
 * Next zero-padded sequence for a `HM-<kind>-nnnn` id column. The digits start
 * after the second dash, whatever the length of the kind (`WO`, `LAB`, `PI`).
 */
export async function nextSequence(
  db: Database,
  table: string,
  column = "id",
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT MAX(CAST(SUBSTR(${column}, INSTR(SUBSTR(${column}, 4), '-') + 4) AS INTEGER)) AS max FROM ${table}`,
    )
    .first<{ max: number | null }>();
  return (row?.max ?? 0) + 1;
}
