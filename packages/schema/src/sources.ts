import { z } from "zod";

import { trustTierSchema } from "./common/enums";
import { lessonIdSchema } from "./common/ids";
import {
  dateSchema,
  markdownSchema,
  slugSchema,
  timestampSchema,
  urlSchema,
} from "./common/primitives";

/*
 * Source records and claims (D-011, RFP §33, §35). Every factual claim in a
 * lesson carries provenance; paid material is notes-only and never ingested.
 */

export const sourceIdSchema = slugSchema.describe(
  "Source id, e.g. src.iproute2.ip-route",
);
export type SourceId = z.infer<typeof sourceIdSchema>;

export const sourceKindSchema = z.enum([
  "rfc",
  "standard",
  "official_documentation",
  "vendor_documentation",
  "manual_page",
  "certification_objectives",
  "free_material",
  "own_notes",
  "book_notes",
]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const sourceRecordSchema = z.strictObject({
  id: sourceIdSchema,
  title: z.string().min(1).max(200),
  kind: sourceKindSchema,
  trust_tier: trustTierSchema,
  url: urlSchema.optional(),
  /** Free-text citation (edition, section, authors) when a URL is not the whole story. */
  citation: z.string().max(500).optional(),
  /** False for paid books and courses: pointers only (UI-SYSTEM §13). */
  ingested: z.boolean(),
  license_note: z.string().max(500).optional(),
  retrieved_at: dateSchema.optional(),
  /** Edition, revision, or document version consulted. */
  document_version: z.string().max(80).optional(),
  notes: markdownSchema.optional(),
});
export type SourceRecord = z.infer<typeof sourceRecordSchema>;

export const claimVerificationSchema = z.enum([
  "unverified",
  "verified",
  "conflict",
  "rejected",
]);

export const claimSchema = z.strictObject({
  /** Lesson-local id referenced from the body as `[^c:<id>]`. */
  id: slugSchema,
  lesson_id: lessonIdSchema,
  statement: z.string().min(1).max(1000),
  source_ids: z.array(sourceIdSchema).min(1),
  verification: claimVerificationSchema,
  verified_by: z.string().max(120).optional(),
  verified_at: timestampSchema.optional(),
  notes: markdownSchema.optional(),
});
export type Claim = z.infer<typeof claimSchema>;
