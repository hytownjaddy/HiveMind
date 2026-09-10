import { z } from "zod";

import { labSessionIdSchema } from "./common/ids";
import { semverSchema, slugSchema, timestampSchema } from "./common/primitives";

/*
 * Terminal recordings (D-019). One asciicast v2 file per node per session is
 * written to R2 after the D-019 redaction filter; this is the header line.
 * Event lines follow the asciicast format: `[seconds, "o" | "i" | "r", data]`.
 */

export const recordingHeaderSchema = z.strictObject({
  version: z.literal(2),
  width: z.int().min(1),
  height: z.int().min(1),
  /** Unix epoch seconds of the first frame. */
  timestamp: z.int().min(0),
  title: z.string().max(200),
  env: z.strictObject({ TERM: z.string(), SHELL: z.string() }),
  hivemind: z.strictObject({
    lab_session_id: labSessionIdSchema,
    node: slugSchema,
    provider_id: slugSchema,
    /** Version of the redaction filter applied before storage. */
    redaction_version: semverSchema,
    recorded_at: timestampSchema,
  }),
});
export type RecordingHeader = z.infer<typeof recordingHeaderSchema>;
