import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildArtifacts,
  diffArtifacts,
  LOCK_FILE,
  reconcileLock,
  serializeLock,
  type ContractLock,
} from "../src/export";

/*
 * `bun run schema:export`          write schemas/, fixtures, and the lock
 * `bun run schema:export --check`  exit 1 when anything is out of date
 */

const SCHEMAS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "schemas",
);

function readDisk(): { files: Map<string, string>; lock: ContractLock } {
  const files = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name.endsWith(".json") && name !== LOCK_FILE) {
        files.set(
          relative(SCHEMAS_DIR, full).split("\\").join("/"),
          readFileSync(full, "utf8"),
        );
      }
    }
  };
  mkdirSync(SCHEMAS_DIR, { recursive: true });
  walk(SCHEMAS_DIR);
  let lock: ContractLock = {};
  try {
    lock = JSON.parse(readFileSync(join(SCHEMAS_DIR, LOCK_FILE), "utf8")) as ContractLock;
  } catch {
    lock = {};
  }
  return { files, lock };
}

async function main(): Promise<number> {
  const check = process.argv.includes("--check");
  const disk = readDisk();
  if (check) {
    const problems = await diffArtifacts(disk);
    if (problems.length > 0) {
      for (const problem of problems) {
        console.error(`schema:check: ${problem}`);
      }
      return 1;
    }
    console.log(
      `schema:check: ${disk.files.size} files and ${Object.keys(disk.lock).length} lock entries in sync`,
    );
    return 0;
  }
  const built = await buildArtifacts();
  const outcome = reconcileLock(disk.lock, built.hashes);
  if (outcome.errors.length > 0) {
    for (const error of outcome.errors) {
      console.error(`schema:export: ${error}`);
    }
    return 1;
  }
  for (const path of disk.files.keys()) {
    if (!built.files.has(path)) {
      rmSync(join(SCHEMAS_DIR, path));
      console.log(`removed schemas/${path}`);
    }
  }
  let written = 0;
  for (const [path, content] of built.files) {
    const full = join(SCHEMAS_DIR, path);
    if (disk.files.get(path) !== content) {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
      written += 1;
    }
  }
  writeFileSync(join(SCHEMAS_DIR, LOCK_FILE), serializeLock(outcome.lock));
  console.log(
    `schema:export: ${built.files.size} files (${written} written), ${outcome.added.length} lock entries added`,
  );
  return 0;
}

process.exitCode = await main();
