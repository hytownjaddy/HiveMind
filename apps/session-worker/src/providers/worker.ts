import { DESTROY_TIMEOUT_MS, provisionTimeoutMs } from "@hivemind/core";
import {
  workerEnvelopeSchema,
  type ExecutionClass,
  type LabProviderDescriptor,
  type WorkerEnvelope,
  type WorkerMessage,
} from "@hivemind/schema";

import {
  ProviderUnavailable,
  type DestroyInput,
  type DestroyOutcome,
  type ExecInput,
  type ExecOutcome,
  type ProvisionInput,
  type ProvisionOutcome,
  type PtyInput,
  type SessionProvider,
} from "./index";

/*
 * Lab worker provider (Class B/C on the Ubuntu host). Jobs are pushed as
 * worker-protocol envelopes to the agent's Tunnel hostname with the Worker's
 * service token; results arrive later on the callback path. PTYs are outbound
 * WebSockets to the agent, one per node.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface WorkerProviderConfig {
  readonly descriptor: LabProviderDescriptor;
  readonly executionClass: ExecutionClass;
  readonly endpoint: string;
  readonly fetchImpl: FetchLike;
  readonly headers: Readonly<Record<string, string>>;
  readonly senderId: string;
}

export function isoNowString(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
}

export class WorkerProvider implements SessionProvider {
  readonly descriptor: LabProviderDescriptor;
  readonly executionClass: ExecutionClass;

  constructor(private readonly config: WorkerProviderConfig) {
    this.descriptor = config.descriptor;
    this.executionClass = config.executionClass;
  }

  private envelope(message: WorkerMessage, correlationId: string): WorkerEnvelope {
    return workerEnvelopeSchema.parse({
      protocol_version: 1,
      message_id: crypto.randomUUID(),
      correlation_id: correlationId,
      sent_at: isoNowString(),
      sender: { kind: "session_worker", id: this.config.senderId },
      message,
    });
  }

  private async push(message: WorkerMessage, correlationId: string): Promise<void> {
    const url = `${this.config.endpoint.replace(/\/+$/u, "")}/jobs`;
    let response: Response;
    try {
      response = await this.config.fetchImpl(url, {
        method: "POST",
        headers: { ...this.config.headers, "content-type": "application/json" },
        body: JSON.stringify(this.envelope(message, correlationId)),
      });
    } catch (error) {
      throw new ProviderUnavailable(
        "worker_unreachable",
        `${this.descriptor.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (response.status !== 202) {
      throw new ProviderUnavailable(
        "worker_rejected_job",
        `${this.descriptor.id} answered ${response.status} to ${message.type}`,
      );
    }
  }

  async provision(input: ProvisionInput): Promise<ProvisionOutcome> {
    await this.push(
      {
        type: "job.provision",
        job_id: input.jobId,
        lab_session_id: input.sessionId,
        lab_spec: input.topology.lab_spec,
        seed: input.topology.seed,
      },
      input.jobId,
    );
    return {
      kind: "pending",
      timeoutMs: provisionTimeoutMs(input.topology.lab_spec.nodes.length),
    };
  }

  async exec(input: ExecInput): Promise<ExecOutcome> {
    await this.push(
      {
        type: "job.exec",
        job_id: input.jobId,
        lab_session_id: input.sessionId,
        node: input.node,
        command: [...input.command],
        timeout_seconds: input.timeoutSeconds,
      },
      input.jobId,
    );
    return { kind: "pending", timeoutMs: (input.timeoutSeconds + 15) * 1000 };
  }

  async destroy(input: DestroyInput): Promise<DestroyOutcome> {
    await this.push(
      {
        type: "job.destroy",
        job_id: input.jobId,
        lab_session_id: input.sessionId,
        reason: input.reason,
      },
      input.jobId,
    );
    return { kind: "pending", timeoutMs: DESTROY_TIMEOUT_MS };
  }

  async openPty(input: PtyInput): Promise<WebSocket> {
    const base = this.config.endpoint.replace(/\/+$/u, "");
    const url = new URL(
      `${base}/sessions/${encodeURIComponent(input.sessionId)}/nodes/${encodeURIComponent(input.node)}/pty`,
    );
    url.searchParams.set("cols", String(input.cols));
    url.searchParams.set("rows", String(input.rows));
    let response: Response;
    try {
      response = await this.config.fetchImpl(url.toString(), {
        headers: { ...this.config.headers, upgrade: "websocket" },
      });
    } catch (error) {
      throw new ProviderUnavailable(
        "worker_unreachable",
        error instanceof Error ? error.message : String(error),
      );
    }
    const socket = response.webSocket;
    if (response.status !== 101 || socket === null) {
      throw new ProviderUnavailable(
        "pty_unavailable",
        `${this.descriptor.id} answered ${response.status} to the PTY upgrade`,
      );
    }
    socket.accept();
    return socket;
  }
}
