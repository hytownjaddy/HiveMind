import type {
  ExecResult,
  ExecutionClass,
  LabProviderDescriptor,
  TopologyInstance,
} from "@hivemind/schema";

import type { SessionNode } from "../lab-session/types";

/*
 * What the LabSession object asks of a provider. Providers either finish a
 * step synchronously (Sandbox, in-process) or accept it and report through
 * the worker protocol callbacks later (lab worker over the Tunnel); the object
 * treats both the same way and guards the pending case with a deadline.
 */

export interface ProvisionInput {
  readonly sessionId: string;
  readonly topology: TopologyInstance;
  readonly jobId: string;
}

export type ProvisionOutcome =
  | {
      readonly kind: "ready";
      readonly handle: string;
      readonly nodes: readonly SessionNode[];
    }
  | { readonly kind: "pending"; readonly timeoutMs: number };

export interface DestroyInput {
  readonly sessionId: string;
  readonly reason: "completed" | "expired" | "requested" | "failed" | "orphaned";
  readonly jobId: string;
}

export type DestroyOutcome =
  | { readonly kind: "destroyed" }
  | { readonly kind: "pending"; readonly timeoutMs: number };

export interface ExecInput {
  readonly sessionId: string;
  readonly node: string;
  readonly command: readonly string[];
  readonly timeoutSeconds: number;
  readonly jobId: string;
}

export type ExecOutcome =
  | { readonly kind: "result"; readonly result: ExecResult }
  | { readonly kind: "pending"; readonly timeoutMs: number };

export interface PtyInput {
  readonly sessionId: string;
  readonly node: string;
  readonly cols: number;
  readonly rows: number;
}

export interface SessionProvider {
  readonly descriptor: LabProviderDescriptor;
  readonly executionClass: ExecutionClass;
  provision(input: ProvisionInput): Promise<ProvisionOutcome>;
  exec(input: ExecInput): Promise<ExecOutcome>;
  destroy(input: DestroyInput): Promise<DestroyOutcome>;
  /** An accepted client-side WebSocket speaking the PTY control protocol. */
  openPty(input: PtyInput): Promise<WebSocket>;
}

export class ProviderUnavailable extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
