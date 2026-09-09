import { canonicalJson } from "./common/versioning";
import {
  CONTRACTS,
  contractById,
  generateJsonSchemas,
  schemaFileName,
} from "./contracts";
import { FIXTURES } from "./fixtures";

/*
 * Build and verify the generated artifacts under `schemas/` (D-032, acceptance
 * criterion 3):
 *   schemas/<Contract>.schema.json      JSON Schema per contract
 *   schemas/contracts.lock.json         sha256 per `<Contract>@<version>`, append-only
 *   schemas/fixtures/<Contract>/*.json  validated example documents
 *
 * The lock makes an unbumped change visible: a contract's hash may only change
 * together with its version. Runs on bun/node only (uses node:fs).
 */

export const LOCK_FILE = "contracts.lock.json";

export type ContractLock = Record<string, string>;

export interface Artifacts {
  /** Relative path under `schemas/` → file contents (with trailing newline). */
  readonly files: ReadonlyMap<string, string>;
  /** `<Contract>@<version>` → sha256 of the canonical JSON Schema. */
  readonly hashes: ReadonlyMap<string, string>;
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(JSON.parse(canonicalJson(value)), null, 2)}\n`;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function buildArtifacts(): Promise<Artifacts> {
  const files = new Map<string, string>();
  const hashes = new Map<string, string>();
  const schemas = generateJsonSchemas();
  for (const contract of CONTRACTS) {
    const schema = schemas[contract.id];
    files.set(schemaFileName(contract.id), stableStringify(schema));
    hashes.set(
      `${contract.id}@${contract.version}`,
      await sha256Hex(canonicalJson(schema)),
    );
  }
  const seen = new Set<string>();
  for (const fixture of FIXTURES) {
    const key = `${fixture.contract}/${fixture.name}`;
    if (seen.has(key)) {
      throw new Error(`duplicate fixture ${key}`);
    }
    seen.add(key);
    const parsed = contractById(fixture.contract).schema.safeParse(fixture.value);
    if (!parsed.success) {
      throw new Error(`fixture ${key} is invalid:\n${parsed.error.message}`);
    }
    files.set(
      `fixtures/${fixture.contract}/${fixture.name}.json`,
      stableStringify(parsed.data),
    );
  }
  return { files, hashes };
}

export interface LockOutcome {
  readonly lock: ContractLock;
  readonly errors: readonly string[];
  readonly added: readonly string[];
}

/**
 * Merge freshly computed hashes into the existing lock. An existing entry
 * whose hash differs is an unbumped change and is reported, never rewritten.
 */
export function reconcileLock(
  existing: ContractLock,
  hashes: ReadonlyMap<string, string>,
): LockOutcome {
  const errors: string[] = [];
  const added: string[] = [];
  const lock: ContractLock = { ...existing };
  for (const [key, hash] of hashes) {
    const locked = existing[key];
    if (locked === undefined) {
      lock[key] = hash;
      added.push(key);
    } else if (locked !== hash) {
      errors.push(
        `contract ${key} changed without a version bump (locked ${locked.slice(0, 12)}, now ${hash.slice(0, 12)}); bump its version in packages/schema/src/contracts.ts`,
      );
    }
  }
  const sorted: ContractLock = {};
  for (const key of Object.keys(lock).sort()) {
    sorted[key] = lock[key] as string;
  }
  return { lock: sorted, errors, added };
}

export function serializeLock(lock: ContractLock): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
}

export interface OnDisk {
  readonly files: ReadonlyMap<string, string>;
  readonly lock: ContractLock;
}

/** Compare generated artifacts with what is committed; empty array means in sync. */
export async function diffArtifacts(disk: OnDisk): Promise<string[]> {
  const built = await buildArtifacts();
  const problems: string[] = [];
  for (const [path, content] of built.files) {
    const current = disk.files.get(path);
    if (current === undefined) {
      problems.push(`missing schemas/${path}; run bun run schema:export`);
    } else if (current !== content) {
      problems.push(`schemas/${path} is out of date; run bun run schema:export`);
    }
  }
  for (const path of disk.files.keys()) {
    if (!built.files.has(path)) {
      problems.push(`schemas/${path} is stale (no longer generated); delete it`);
    }
  }
  const outcome = reconcileLock(disk.lock, built.hashes);
  problems.push(...outcome.errors);
  for (const key of outcome.added) {
    problems.push(
      `schemas/${LOCK_FILE} has no entry for ${key}; run bun run schema:export`,
    );
  }
  return problems;
}
