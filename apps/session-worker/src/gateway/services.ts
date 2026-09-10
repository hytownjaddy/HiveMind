import {
  defaultArchetypeRegistry,
  LabSessionIndexRepository,
  LabSessionService,
  LabWorkerRepository,
  LearnerRepository,
  systemClock,
} from "@hivemind/core";

import { LOOPBACK_ENDPOINT, LOOPBACK_WORKER_ID } from "./loopback";

/*
 * Service factory for the gateway (D-031): the entry point parses,
 * authenticates, calls one of these, and serializes.
 */

export function nowIso(): string {
  return systemClock.now();
}

export function services(env: Env) {
  const sessions = new LabSessionIndexRepository(env.DB, systemClock);
  const workers = new LabWorkerRepository(env.DB, systemClock);
  const learners = new LearnerRepository(env.DB, systemClock);
  return {
    sessions,
    workers,
    learners,
    labs: new LabSessionService({
      sessions,
      workers,
      learners,
      archetypes: defaultArchetypeRegistry(),
      sandboxEnabled: env.SANDBOX_ENABLED === "true" && env.Sandbox !== undefined,
    }),
  };
}

/** Registers the in-Worker agent as a lab worker so dev and tests have a provider. */
export async function ensureLoopbackWorker(
  env: Env,
  workers: LabWorkerRepository,
): Promise<void> {
  if (env.PROVIDER_LOOPBACK !== "true" || env.HIVEMIND_ENV === "production") {
    return;
  }
  await workers.heartbeat({
    worker_id: LOOPBACK_WORKER_ID,
    capabilities: [
      "shell.linux",
      "network.namespace",
      "network.veth",
      "network.bridge",
      "network.containerlab",
      "routing.frr",
      "privilege.net_admin",
    ],
    active_sessions: 0,
    load: { cpu_percent: 0, memory_percent: 0 },
    runtime_versions: { loopback: "1" },
    at: systemClock.now(),
    endpoint: LOOPBACK_ENDPOINT,
    agent_version: "0.0.0",
    hostname: "loopback",
  });
}
