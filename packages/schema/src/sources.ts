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

export const claimVerificationStatusSchema = z.enum([
  "unverified",
  "verified",
  "conflict",
  "rejected",
]);

/** How a claim was (or will be) checked; executable checks are strongest (D-015 spirit). */
export const claimVerificationMethodSchema = z.enum([
  "documentation",
  "executable",
  "expert",
]);

export const claimVerificationSchema = z.strictObject({
  status: claimVerificationStatusSchema,
  method: claimVerificationMethodSchema.optional(),
  verified_at: timestampSchema.optional(),
  /** `human` or a named reviewer; never an AI executor (invariant 3). */
  reviewer: z.string().max(120).optional(),
  /** Id of the executable test that proves the claim, once it exists (Stage 03). */
  test_id: slugSchema.optional(),
  notes: markdownSchema.optional(),
});
export type ClaimVerification = z.infer<typeof claimVerificationSchema>;

/** A source reference with the section, anchor, or page that supports the claim. */
export const claimSourceSchema = z.strictObject({
  id: sourceIdSchema,
  locator: z.string().min(1).max(200).optional(),
});
export type ClaimSource = z.infer<typeof claimSourceSchema>;

export const claimSchema = z.strictObject({
  /** Lesson-local id referenced from the body as `:claim[id]`. */
  id: slugSchema,
  lesson_id: lessonIdSchema,
  statement: z.string().min(1).max(1000),
  sources: z.array(claimSourceSchema).min(1),
  verification: claimVerificationSchema,
});
export type Claim = z.infer<typeof claimSchema>;
