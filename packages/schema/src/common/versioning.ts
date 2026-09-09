import { semverSchema, type SemVer } from "./primitives";

/*
 * Versioning helpers shared by the content compiler, the CLI, and the
 * contract lock (invariants 6–8; acceptance criterion 3).
 */

export interface ParsedSemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export function parseSemver(version: string): ParsedSemVer {
  const value = semverSchema.parse(version);
  const [major, minor, patch] = value.split(".").map(Number) as [number, number, number];
  return { major, minor, patch };
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const left = parseSemver(a);
  const right = parseSemver(b);
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) {
      return left[key] < right[key] ? -1 : 1;
    }
  }
  return 0;
}

export function bumpSemver(version: string, part: "major" | "minor" | "patch"): SemVer {
  const { major, minor, patch } = parseSemver(version);
  switch (part) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
  }
}

/** A reference to a specific version of a definition. */
export interface VersionRef {
  readonly id: string;
  readonly version: SemVer;
}

export function formatVersionRef(ref: VersionRef): string {
  return `${ref.id}@${ref.version}`;
}

/**
 * Deterministic JSON: object keys sorted recursively, no whitespace. Used for
 * hashing specs (`spec_hash`), content bundles, and contract schemas.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) {
        sorted[key] = sortKeys(record[key]);
      }
    }
    return sorted;
  }
  return value;
}

/** SHA-256 hex digest of the canonical JSON of `value` (Web Crypto; runs on workerd). */
export async function hashCanonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
