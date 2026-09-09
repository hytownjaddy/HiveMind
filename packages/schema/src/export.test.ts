import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildArtifacts,
  diffArtifacts,
  LOCK_FILE,
  reconcileLock,
  type ContractLock,
} from "./export";

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
        files.set(relative(SCHEMAS_DIR, full), readFileSync(full, "utf8"));
      }
    }
  };
  walk(SCHEMAS_DIR);
  const lock = JSON.parse(
    readFileSync(join(SCHEMAS_DIR, LOCK_FILE), "utf8"),
  ) as ContractLock;
  return { files, lock };
}

describe("schemas/ artifacts", () => {
  it("are in sync with packages/schema (run bun run schema:export)", async () => {
    expect(await diffArtifacts(readDisk())).toEqual([]);
  });

  it("generate deterministically", async () => {
    const first = await buildArtifacts();
    const second = await buildArtifacts();
    expect([...first.files]).toEqual([...second.files]);
    expect([...first.hashes]).toEqual([...second.hashes]);
  });

  it("emit relative $ref links between contracts", async () => {
    const { files } = await buildArtifacts();
    const envelope = files.get("WorkerEnvelope.schema.json");
    expect(envelope).toContain('"$ref": "WorkerMessage.schema.json"');
  });
});

describe("contract lock", () => {
  it("adds entries for new versions", () => {
    const outcome = reconcileLock({}, new Map([["Learner@1.0.0", "abc"]]));
    expect(outcome.added).toEqual(["Learner@1.0.0"]);
    expect(outcome.lock).toEqual({ "Learner@1.0.0": "abc" });
    expect(outcome.errors).toEqual([]);
  });

  it("rejects a changed schema at an unchanged version", () => {
    const outcome = reconcileLock(
      { "Learner@1.0.0": "abc" },
      new Map([["Learner@1.0.0", "def"]]),
    );
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]).toContain("without a version bump");
    expect(outcome.lock["Learner@1.0.0"]).toBe("abc");
  });

  it("accepts a changed schema at a bumped version and keeps history", () => {
    const outcome = reconcileLock(
      { "Learner@1.0.0": "abc" },
      new Map([["Learner@1.1.0", "def"]]),
    );
    expect(outcome.errors).toEqual([]);
    expect(outcome.lock).toEqual({ "Learner@1.0.0": "abc", "Learner@1.1.0": "def" });
  });
});
