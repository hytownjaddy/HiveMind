import {
  attemptFixture,
  attemptResultFixture,
  linuxSingleInstance,
  problemInstanceFixture,
} from "@hivemind/schema/fixtures";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { AttemptRepository } from "../src/db/attempts";
import { LabSessionIndexRepository } from "../src/db/lab-sessions";
import { ProblemInstanceRepository } from "../src/db/problem-instances";
import { fixedClock } from "./clock";

describe("attempts are append-only (invariant 9)", () => {
  it("inserts, records a result once, and refuses rewrites and deletes", async () => {
    await new ProblemInstanceRepository(env.DB).insert(problemInstanceFixture);
    await new LabSessionIndexRepository(env.DB, fixedClock()).create({
      id: "HM-LAB-829143",
      learner_id: "HM-LRN-000001",
      requires: ["routing.frr"],
      status: "completed",
      archetype: "linux.single",
      archetype_version: "1.0.0",
      seed: 1,
      topology: linuxSingleInstance,
      problem_instance_id: problemInstanceFixture.id,
    });
    const attempts = new AttemptRepository(env.DB);
    await attempts.insert({ ...attemptFixture, status: "submitted" });
    await attempts.recordResult(attemptResultFixture, "2026-09-09T12:24:17Z");
    const stored = await attempts.get(attemptFixture.id);
    expect(stored?.result?.technical_score).toBe(1);
    expect(stored?.attempt.status).toBe("submitted");
    await expect(
      attempts.recordResult(attemptResultFixture, "2026-09-09T12:30:00Z"),
    ).rejects.toThrow(/no pending result slot/u);
    await expect(
      env.DB.prepare("UPDATE attempts SET attempt_json = '{}' WHERE id = ?")
        .bind(attemptFixture.id)
        .run(),
    ).rejects.toThrow(/immutable/u);
    await expect(
      env.DB.prepare("UPDATE attempts SET result_json = '{}' WHERE id = ?")
        .bind(attemptFixture.id)
        .run(),
    ).rejects.toThrow(/immutable/u);
    await expect(
      env.DB.prepare("DELETE FROM attempts WHERE id = ?").bind(attemptFixture.id).run(),
    ).rejects.toThrow(/immutable/u);
    expect(await attempts.listByLearner("HM-LRN-000001")).toHaveLength(1);
  });
});
