import Link from "next/link";

import { listLabSessionsForGuest, type LabSessionRow } from "@/lib/db/lab-sessions";
import { getVerifiedGuest } from "@/lib/server/guest";

import { StatusPill } from "./StatusPill";

async function loadRows(): Promise<{ rows: LabSessionRow[]; error: string | null }> {
  const guest = await getVerifiedGuest();
  if (guest === null) {
    return { rows: [], error: null };
  }
  try {
    return { rows: await listLabSessionsForGuest(guest.guestId), error: null };
  } catch (caught) {
    return {
      rows: [],
      error: caught instanceof Error ? caught.message : "d1-unavailable",
    };
  }
}

/** Server component: D1-backed index of this guest's sessions (RFP §95 History). */
export async function RecentSessions() {
  const { rows, error } = await loadRows();
  if (error !== null) {
    return (
      <p className="text-sm text-zinc-500">
        D1 is not ready ({error}). Run{" "}
        <code className="font-mono">bun run db:migrate:local</code>.
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No sessions yet.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-800 rounded-md border border-zinc-800">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-sm">
          <StatusPill status={row.status} />
          <Link
            href={`/labs/${row.id}`}
            className="font-mono text-zinc-200 hover:text-hive-amber"
          >
            {row.id.slice(0, 8)}
          </Link>
          <span className="font-mono text-xs text-zinc-500">{row.capability}</span>
          <span className="ml-auto text-xs text-zinc-600">
            {new Date(row.createdAt).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
