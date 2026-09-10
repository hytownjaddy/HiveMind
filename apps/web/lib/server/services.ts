import {
  AttemptRepository,
  ContentRepository,
  ContentService,
  defaultArchetypeRegistry,
  ExportService,
  ExportStore,
  HealthService,
  InfrastructureService,
  isoNow,
  LabSessionEventRepository,
  LabSessionIndexRepository,
  LabWorkerRepository,
  LearnerRepository,
  LearnerService,
  ReviewItemRepository,
  systemClock,
  WorkOrderRepository,
  WorkOrderService,
} from "@hivemind/core";

import { APP_VERSION, cloudflareEnv, environmentOf } from "./env";

/*
 * Service factory for route handlers and server components (D-031). Handlers
 * parse, authenticate, call one of these, and serialize; nothing else.
 */

export const RUNTIME_VERSIONS: Readonly<Record<string, string>> = {
  next: "16",
  workerd: "2026-08-15",
  python: "3.13",
};

export async function services() {
  const env = await cloudflareEnv();
  const learners = new LearnerRepository(env.DB, systemClock);
  const content = new ContentRepository(env.DB, systemClock);
  const orders = new WorkOrderRepository(env.DB);
  const attempts = new AttemptRepository(env.DB);
  const exportStore =
    env.EXPORTS === undefined ? undefined : new ExportStore(env.EXPORTS);
  const health = new HealthService({
    db: env.DB,
    exports: exportStore,
    sessionWorker: env.SESSION,
    version: APP_VERSION,
    environment: environmentOf(env),
    runtimeVersions: RUNTIME_VERSIONS,
    now: () => isoNow(),
  });
  const labSessions = new LabSessionIndexRepository(env.DB, systemClock);
  return {
    env,
    learners,
    learner: new LearnerService(learners),
    content: new ContentService(content),
    contentRepository: content,
    workOrders: new WorkOrderService(orders, systemClock),
    labSessions,
    reviewItems: new ReviewItemRepository(env.DB),
    exportStore,
    export: new ExportService(learners, content, orders, attempts, () => isoNow()),
    health,
    infrastructure: new InfrastructureService({
      workers: new LabWorkerRepository(env.DB, systemClock),
      sessions: labSessions,
      events: new LabSessionEventRepository(env.DB),
      archetypes: defaultArchetypeRegistry(),
      health: () => health.report(),
      lastExport: async () => (exportStore === undefined ? null : exportStore.latest()),
      // Mirrors the session Worker's SANDBOX_ENABLED (the web Worker cannot see
      // its bindings); flip both when the Sandbox container is deployed.
      sandboxEnabled: env.SANDBOX_ENABLED === "true",
      now: () => isoNow(),
    }),
  };
}
