import { linuxSingleInstance } from "@hivemind/schema/fixtures";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { LabSessionEventRepository } from "../src/db/lab-session-events";
import { LabSessionIndexRepository } from "../src/db/lab-sessions";
import { LabWorkerRepository } from "../src/db/lab-workers";
import { ArchetypeRegistry } from "../src/labs/archetypes";
import { ARCHETYPES } from "../src/labs/registry";
import type { HealthReport } from "../src/services/health";
import { InfrastructureService } from "../src/services/infrastructure";
import { fixedClock } from "./clock";

const health: HealthReport = {
  ok: true,
  checked_at: "2026-09-09T12:00:00Z",
  version: "0.1.0",
  environment: "test",
  components: [{ component: "d1", state: "online" }],
  runtime_versions: {},
};

describe("infrastructure overview (companion 18)", () => {
  it("reports workers, sessions by class, runtime pins, failures, and events", async () => {
    const clock = fixedClock();
    const workers = new LabWorkerRepository(env.DB, clock);
    const sessions = new LabSessionIndexRepository(env.DB, clock);
    const events = new LabSessionEventRepository(env.DB);
    const service = new InfrastructureService({
      workers,
      sessions,
      events,
      archetypes: new ArchetypeRegistry(ARCHETYPES),
      health: async () => health,
      lastExport: async () => null,
      sandboxEnabled: true,
      now: () => clock.now(),
    });

    const empty = await service.overview();
    expect(empty.workers).toEqual([]);
    expect(empty.overall).toBe("online");
    expect((await service.labHost()).detail).toContain("sandbox only");
    expect(empty.runtimes.map((row) => row.name).sort()).toEqual([
      "agent",
      "containerlab",
      "frr",
      "linux-lab",
    ]);
    expect(empty.runtimes.find((row) => row.name === "frr")?.pinned).toContain(
      "@sha256:",
    );

    await workers.heartbeat({
      worker_id: "ubuntu-lab-worker-1",
      capabilities: ["shell.linux", "routing.frr"],
      active_sessions: 2,
      load: { cpu_percent: 12, memory_percent: 40 },
      runtime_versions: { docker: "28.5.1", containerlab: "0.78.0", frr: "10.7.1" },
      at: clock.now(),
      endpoint: "https://lab-worker.jryans.dev",
      agent_version: "0.2.0",
      hostname: "lab-worker-1",
    });
    await sessions.create({
      id: "HM-LAB-000001",
      learner_id: "HM-LRN-000001",
      requires: ["shell.linux"],
      status: "queued",
      archetype: "linux.single",
      archetype_version: "1.0.0",
      seed: 1,
      topology: linuxSingleInstance,
    });
    await sessions.update("HM-LAB-000001", {
      status: "active",
      provider_id: "ubuntu-lab-worker-1",
      provider_class: "C",
      worker_id: "ubuntu-lab-worker-1",
    });
    await sessions.create({
      id: "HM-LAB-000002",
      learner_id: "HM-LRN-000001",
      requires: ["shell.linux"],
      status: "queued",
      archetype: "linux.single",
      archetype_version: "1.0.0",
      seed: 2,
      topology: linuxSingleInstance,
    });
    await sessions.update("HM-LAB-000002", {
      status: "failed",
      provider_id: "cloudflare-sandbox",
      provider_class: "A",
      reason: "sandbox_start_failed: boom",
    });
    await events.append("HM-LAB-000002", {
      sequence: 1,
      revision: 1,
      at: clock.now(),
      event: {
        type: "status_changed",
        from: "provisioning",
        to: "failed",
        reason: "boom",
      },
    });

    const overview = await service.overview();
    expect(overview.workers_online).toBe(1);
    expect(overview.running_by_class).toEqual({ A: 0, B: 0, C: 1 });
    expect(overview.queue).toEqual([]);
    expect(overview.failures.map((s) => s.reason)).toEqual([
      "sandbox_start_failed: boom",
    ]);
    expect(overview.events).toHaveLength(1);
    const containerlab = overview.runtimes.find((row) => row.name === "containerlab");
    expect(containerlab?.reported).toBe("0.78.0");
    expect(containerlab?.state).toBe("update_available");
    expect(overview.runtimes.find((row) => row.name === "frr")?.state).toBe("ok");
    expect(overview.runtimes.find((row) => row.name === "docker")?.reported).toBe(
      "28.5.1",
    );
    const host = await service.labHost();
    expect(host.state).toBe("online");
    expect(host.environments).toBe(2);
    expect(host.cpu_percent).toBe(12);
  });
});
