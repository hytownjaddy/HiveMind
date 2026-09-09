import { z } from "zod";

/*
 * Field conventions for every contract (D-032, D-038):
 *   - snake_case JSON fields, shared verbatim by D1 columns, YAML content files,
 *     and the generated Pydantic models;
 *   - timestamps are UTC ISO-8601 strings with a trailing `Z` so they survive a
 *     TypeScript → JSON → Python → JSON round trip byte for byte;
 *   - versions are semantic versions carried on the record itself.
 */

/** UTC instant, e.g. `2026-09-09T14:03:00Z` or `2026-09-09T14:03:00.123Z`. */
export const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u, "invalid-timestamp")
  .describe("UTC instant in ISO-8601 with a trailing Z");
export type Timestamp = z.infer<typeof timestampSchema>;

/** Calendar date, e.g. `2026-09-09`. */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "invalid-date");

/** Semantic version `major.minor.patch` (invariants 6–8). */
export const semverSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u, "invalid-semver")
  .describe("Semantic version major.minor.patch");
export type SemVer = z.infer<typeof semverSchema>;

/** Lowercase slug with dots, dashes, and underscores: `linux-networking`, `src.rfc1812`. */
export const slugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u, "invalid-slug");
export type Slug = z.infer<typeof slugSchema>;

/** Dotted identifier for skills and capabilities: `linux.networking.routing_table`. */
export const dottedIdSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/u, "invalid-dotted-id");

export const markdownSchema = z
  .string()
  .describe("Markdown text, rendered by the web app");

/** http(s) URL as a pattern-checked string; `format: uri` would become Pydantic `AnyUrl` and normalize it (D-043). */
export const urlSchema = z
  .string()
  .max(2048)
  .regex(/^https?:\/\/[^\s/$.?#][^\s]*$/u, "invalid-url");

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u, "invalid-sha256");

/**
 * UUID as a plain pattern-checked string (not `format: uuid`): generated Pydantic
 * keeps it a `str`, so job and message ids round-trip byte for byte (D-043).
 */
export const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    "invalid-uuid",
  );

/** Learner-facing difficulty on a five-step scale. */
export const difficultySchema = z.int().min(1).max(5);

/** Unit interval score used by graders and mastery. */
export const unitScoreSchema = z.number().min(0).max(1);

/** Whole-number percentage shown in the UI (always beside confidence, D-014). */
export const percentSchema = z.int().min(0).max(100);

export const nonNegativeIntSchema = z.int().min(0);
export const positiveIntSchema = z.int().min(1);

/** Free-form structured data whose shape is owned by a versioned module (invariant 4). */
export const jsonObjectSchema = z.record(z.string(), z.unknown());
