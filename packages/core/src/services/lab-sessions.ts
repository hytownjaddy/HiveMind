import {
  createSessionRequestSchema,
  type CreateSessionRequest,
  type ExecutionClass,
  type LabProviderDescriptor,
  type LabWorker,
  type TopologyInstance,
} from "@hivemind/schema";

import type { LabSessionIndexRepository } from "../db/lab-sessions";
import type { LabWorkerRepository } from "../db/lab-workers";
import type { LearnerRecord, LearnerRepository } from "../db/learners";
import type { ArchetypeRegistry } from "../labs/archetypes";
import { instantiateTopology } from "../labs/instantiate";
import {
  selectProvider,
  type ProviderCandidate,
  type Selection,
} from "../labs/selection";

/*
 * Application service behind `POST /session/labs` (D-031): resolve the
 * archetype, instantiate by seed, pick a provider by capability, allocate the
 * id. The Durable Object then owns the session. Also resolves the operator
 * learner for `lab:operate` service tokens (single learner, D-001/D-008).
 */

export const SANDBOX_PROVIDER: LabProviderDescriptor = {
  id: "cloudflare-sandbox",
  kind: "sandbox",
  version: "0.12.9",
  capabilities: ["shell.linux", "runtime.python", "runtime.node"],
};

export interface SessionPlan {
  readonly id: string;
  readonly topology: TopologyInstance;
  readonly provider: LabProviderDescriptor;
  readonly executionClass: ExecutionClass;
  readonly worker: LabWorker | null;
  readonly hardTtlMinutes: number;
}

export type PlanOutcome =
  | { readonly ok: true; readonly plan: SessionPlan }
  | {
      readonly ok: false;
      readonly status: 404 | 422 | 503;
      readonly error: string;
      readonly detail: string;
    };

export interface LabSessionServiceDeps {
  readonly sessions: LabSessionIndexRepository;
  readonly workers: LabWorkerRepository;
  readonly learners: LearnerRepository;
  readonly archetypes: ArchetypeRegistry;
  /** Whether the Sandbox binding is configured in this environment. */
  readonly sandboxEnabled: boolean;
}

export class LabSessionService {
  constructor(private readonly deps: LabSessionServiceDeps) {}

  async candidates(): Promise<{ candidates: ProviderCandidate[]; workers: LabWorker[] }> {
    const workers = await this.deps.workers.list();
    const active = await this.deps.sessions.listActive(500);
    const load = new Map<string, number>();
    for (const session of active) {
      if (session.provider_id !== null) {
        load.set(session.provider_id, (load.get(session.provider_id) ?? 0) + 1);
      }
    }
    const candidates: ProviderCandidate[] = workers.map((worker) => ({
      descriptor: {
        id: worker.id,
        kind: "lab_worker",
        version: worker.agent_version ?? "0.0.0",
        capabilities: worker.capabilities,
        ...(worker.endpoint === null ? {} : { endpoint: worker.endpoint }),
      },
      online: worker.status !== "offline" && worker.endpoint !== null,
      activeSessions: load.get(worker.id) ?? 0,
    }));
    if (this.deps.sandboxEnabled) {
      candidates.push({
        descriptor: SANDBOX_PROVIDER,
        online: true,
        activeSessions: load.get(SANDBOX_PROVIDER.id) ?? 0,
      });
    }
    return { candidates, workers };
  }

  async plan(input: CreateSessionRequest): Promise<PlanOutcome> {
    const request = createSessionRequestSchema.parse(input);
    const archetype = this.deps.archetypes.resolve(request.archetype);
    if (archetype === null) {
      return {
        ok: false,
        status: 404,
        error: "unknown_archetype",
        detail: `no archetype ${request.archetype}; see hivemind topology list`,
      };
    }
    let topology: TopologyInstance;
    try {
      topology = await instantiateTopology(
        archetype,
        request.seed,
        request.parameters ?? {},
      );
    } catch (error) {
      return {
        ok: false,
        status: 422,
        error: "invalid_parameters",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    const { candidates, workers } = await this.candidates();
    const selection: Selection = selectProvider(topology.lab_spec.requires, candidates);
    if (!selection.ok) {
      return {
        ok: false,
        status: selection.code === "unsatisfiable" ? 422 : 503,
        error: selection.code,
        detail: selection.message,
      };
    }
    const worker = workers.find((w) => w.id === selection.provider.id) ?? null;
    const hardTtlMinutes =
      request.ttl_minutes === undefined
        ? topology.lab_spec.ttl_minutes
        : Math.min(request.ttl_minutes, topology.lab_spec.ttl_minutes);
    return {
      ok: true,
      plan: {
        id: await this.deps.sessions.allocateId(),
        topology,
        provider: selection.provider,
        executionClass: selection.executionClass,
        worker,
        hardTtlMinutes,
      },
    };
  }

  /** The learner a `lab:operate` service token acts for: the one bound identity. */
  async operatorLearner(): Promise<LearnerRecord | null> {
    const bound = (await this.deps.learners.list()).filter((l) => l.email !== null);
    return bound.length === 1 ? (bound[0] ?? null) : null;
  }

  /** Sessions the objects still expect on a worker (reconciliation reply). */
  async expectedOnWorker(
    workerId: string,
  ): Promise<{ lab_session_id: string; status: string }[]> {
    return (await this.deps.sessions.listExpectedOnWorker(workerId)).map((session) => ({
      lab_session_id: session.id,
      status: session.status,
    }));
  }
}
