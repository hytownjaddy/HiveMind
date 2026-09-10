import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { LabSessionEventRepository } from "../src/db/lab-session-events";
import { LabSessionIndexRepository } from "../src/db/lab-sessions";
import {
  LabWorkerRepository,
  OFFLINE_AFTER_SECONDS,
  workerStatusAt,
} from "../src/db/lab-workers";
import { instantiateTopology } from "../src/labs/instantiate";
import { fixedClock } from "./clock";

const LINUX_SINGLE = {
  id: "linux.single",
  version: "1.0.0",
  title: "One Linux host",
  description: "A single host.",
  status: "active" as const,
  aliases: [],
  requires: ["shell.linux"],
  generator: "linux.single",
  parameters: [],
  images: { host: "hivemind/linux-lab:1.0.0" },
  resources: { cpu_millicores: 500, memory_mb: 512, disk_mb: 1024 },
  network: { egress: "deny" as const, allowlist: [] },
  ttl_minutes: 60,
  snapshot: false,
};

describe("lab session index (migration 0003)", () => {
  it("allocates sequential ids and stores the topology instance", async () => {
    const clock = fixedClock();
    const repo = new LabSessionIndexRepository(env.DB, clock);
    expect(await repo.allocateId()).toBe("HM-LAB-000001");
    const topology = await instantiateTopology(LINUX_SINGLE, 1);
    const created = await repo.create({
      id: "HM-LAB-000001",
      learner_id: "HM-LRN-000001",
      requires: ["shell.linux"],
      status: "queued",
      archetype: "linux.single",
      archetype_version: "1.0.0",
      seed: 1,
      topology,
      hard_ttl_at: "2026-09-09T13:00:00Z",
    });
    expect(created.nodes).toEqual([{ name: "host1", role: "host" }]);
    expect(created.provider_class).toBeNull();
    expect(await repo.allocateId()).toBe("HM-LAB-000002");
    await repo.update("HM-LAB-000001", {
      status: "ready",
      provider_id: "ubuntu-lab-worker-1",
      provider_class: "C",
      worker_id: "ubuntu-lab-worker-1",
      nodes: [{ name: "host1", role: "host", address: "172.29.0.2" }],
    });
    const updated = await repo.get("HM-LAB-000001");
    expect(updated?.status).toBe("ready");
    expect(updated?.nodes[0]?.address).toBe("172.29.0.2");
    expect((await repo.topology("HM-LAB-000001"))?.spec_hash).toBe(topology.spec_hash);
    expect(
      (await repo.listExpectedOnWorker("ubuntu-lab-worker-1")).map((s) => s.id),
    ).toEqual(["HM-LAB-000001"]);
    await repo.update("HM-LAB-000001", {
      status: "destroyed",
      reason: "requested",
      finished_at: clock.now(),
    });
    expect(await repo.listExpectedOnWorker("ubuntu-lab-worker-1")).toEqual([]);
    expect(await repo.listActive()).toEqual([]);
    expect((await repo.listRecent("HM-LRN-000001")).map((s) => s.reason)).toEqual([
      "requested",
    ]);
  });

  it("keeps a durable event log without terminal output", async () => {
    const clock = fixedClock();
    const sessions = new LabSessionIndexRepository(env.DB, clock);
    await sessions.create({
      id: "HM-LAB-000001",
      learner_id: "HM-LRN-000001",
      requires: ["shell.linux"],
      status: "queued",
      archetype: "linux.single",
      archetype_version: "1.0.0",
      seed: 1,
      topology: await instantiateTopology(LINUX_SINGLE, 1),
    });
    const events = new LabSessionEventRepository(env.DB);
    const event = {
      sequence: 1,
      revision: 1,
      at: clock.now(),
      event: {
        type: "status_changed" as const,
        from: "queued" as const,
        to: "provisioning" as const,
      },
    };
    await events.append("HM-LAB-000001", event);
    await events.append("HM-LAB-000001", event); // replay is idempotent
    expect(await events.listForSession("HM-LAB-000001")).toHaveLength(1);
    expect((await events.listRecent(10))[0]?.event.event.type).toBe("status_changed");
    await expect(
      events.append("HM-LAB-000001", {
        sequence: 2,
        revision: 1,
        at: clock.now(),
        event: { type: "pty_output", node: "host1", data: "secret" },
      }),
    ).rejects.toThrow(/never stored/u);
  });
});

describe("lab worker registry", () => {
  it("registers by heartbeat and derives status from the heartbeat age", async () => {
    const clock = fixedClock();
    const workers = new LabWorkerRepository(env.DB, clock);
    const first = clock.now();
    const registered = await workers.heartbeat({
      worker_id: "ubuntu-lab-worker-1",
      capabilities: ["shell.linux", "routing.frr"],
      active_sessions: 0,
      load: { cpu_percent: 3, memory_percent: 20 },
      runtime_versions: { docker: "28.5.1" },
      at: first,
      endpoint: "https://lab-worker.jryans.dev",
      agent_version: "0.2.0",
    });
    expect(registered.status).toBe("online");
    expect(registered.registered_at).toBe(first);
    // A later heartbeat without an endpoint keeps the registered one.
    const again = await workers.heartbeat({
      worker_id: "ubuntu-lab-worker-1",
      capabilities: ["shell.linux", "routing.frr"],
      active_sessions: 2,
      load: { cpu_percent: 30, memory_percent: 40 },
      runtime_versions: { docker: "28.5.1" },
      at: clock.now(),
    });
    expect(again.endpoint).toBe("https://lab-worker.jryans.dev");
    expect(again.active_sessions).toBe(2);
    expect((await workers.list()).map((w) => w.id)).toEqual(["ubuntu-lab-worker-1"]);
    const stale = new Date(Date.parse(clock.now()) - (OFFLINE_AFTER_SECONDS + 1) * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/u, "Z");
    expect(workerStatusAt(stale, clock.now())).toBe("offline");
    expect(workerStatusAt(clock.now(), clock.now())).toBe("online");
    await workers.remove("ubuntu-lab-worker-1");
    expect(await workers.list()).toEqual([]);
  });
});
