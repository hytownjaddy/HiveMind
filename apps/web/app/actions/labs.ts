"use server";

import {
  labSessionIdSchema,
  labSessionSummarySchema,
  labStatusSchema,
} from "@hivemind/schema";

import { updateLabSessionStatus, upsertLabSession } from "@/lib/db/lab-sessions";
import { getVerifiedGuest } from "@/lib/server/guest";

/** Index a freshly created session in D1 so it shows up in Labs and History. */
export async function recordLabSessionAction(input: unknown): Promise<void> {
  const summary = labSessionSummarySchema.parse(input);
  const guest = await getVerifiedGuest();
  if (guest === null) {
    return;
  }
  try {
    await upsertLabSession(guest.guestId, summary);
  } catch (error) {
    // Local D1 not migrated yet, or binding missing. The live session still works.
    console.warn("recordLabSessionAction failed", error);
  }
}

export async function syncLabSessionStatusAction(
  sessionId: unknown,
  status: unknown,
): Promise<void> {
  const id = labSessionIdSchema.parse(sessionId);
  const next = labStatusSchema.parse(status);
  const guest = await getVerifiedGuest();
  if (guest === null) {
    return;
  }
  try {
    await updateLabSessionStatus(guest.guestId, id, next);
  } catch (error) {
    console.warn("syncLabSessionStatusAction failed", error);
  }
}
