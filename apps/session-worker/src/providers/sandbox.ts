import { getSandbox, proxyTerminal, type Sandbox } from "@cloudflare/sandbox";
import {
  labNodeConfigSchema,
  type ExecutionClass,
  type LabProviderDescriptor,
} from "@hivemind/schema";

import type { SessionNode } from "../lab-session/types";
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
 * Cloudflare Sandbox provider (Class A, and Class C when the benchmark says
 * so). One sandbox per session node, named by session and node so the same
 * session always reaches the same container. Everything is synchronous from
 * the object's point of view: `exec("true")` starts the container and proves
 * it answers; `destroy()` frees it (a sleeping sandbox still counts toward
 * account limits, so destroy is never skipped).
 */

export interface SandboxProviderConfig {
  readonly descriptor: LabProviderDescriptor;
  readonly namespace: DurableObjectNamespace<Sandbox>;
  readonly sleepAfter: string;
}

export function sandboxName(sessionId: string, node: string): string {
  return `${sessionId.toLowerCase()}-${node}`;
}

function shellQuote(argument: string): string {
  return `'${argument.replace(/'/gu, `'\\''`)}'`;
}

export class SandboxProvider implements SessionProvider {
  readonly descriptor: LabProviderDescriptor;
  readonly executionClass: ExecutionClass = "A";

  constructor(private readonly config: SandboxProviderConfig) {
    this.descriptor = config.descriptor;
  }

  private sandbox(sessionId: string, node: string): Sandbox {
    return getSandbox(this.config.namespace, sandboxName(sessionId, node), {
      sleepAfter: this.config.sleepAfter,
    });
  }

  async provision(input: ProvisionInput): Promise<ProvisionOutcome> {
    const spec = input.topology.lab_spec;
    if (spec.links.length > 0) {
      throw new ProviderUnavailable(
        "unsupported_topology",
        "the sandbox runs single nodes only",
      );
    }
    const nodes: SessionNode[] = [];
    for (const node of spec.nodes) {
      const sandbox = this.sandbox(input.sessionId, node.name);
      const probe = await sandbox.exec("true");
      if (!probe.success) {
        throw new ProviderUnavailable(
          "sandbox_start_failed",
          `${node.name}: ${probe.stderr}`,
        );
      }
      const config = labNodeConfigSchema.safeParse(node.config);
      if (config.success && config.data.hostname !== undefined) {
        await sandbox.setEnvVars({
          HIVEMIND_NODE: node.name,
          HIVEMIND_SESSION: input.sessionId,
        });
      }
      nodes.push({ name: node.name, role: node.role });
    }
    return { kind: "ready", handle: sandboxName(input.sessionId, "sandbox"), nodes };
  }

  async exec(input: ExecInput): Promise<ExecOutcome> {
    const started = Date.now();
    const sandbox = this.sandbox(input.sessionId, input.node);
    const result = await sandbox.exec(input.command.map(shellQuote).join(" "), {
      timeout: input.timeoutSeconds * 1000,
    });
    return {
      kind: "result",
      result: {
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration_ms: Date.now() - started,
        timed_out: false,
      },
    };
  }

  async destroy(input: DestroyInput): Promise<DestroyOutcome> {
    // Node names are not known to a destroy call after a failed provision;
    // the object passes every node of the topology through `nodes`.
    void input;
    return { kind: "destroyed" };
  }

  async destroyNodes(sessionId: string, nodes: readonly string[]): Promise<void> {
    for (const node of nodes) {
      try {
        await this.sandbox(sessionId, node).destroy();
      } catch {
        // Already gone or never started.
      }
    }
  }

  async openPty(input: PtyInput): Promise<WebSocket> {
    const sandbox = this.sandbox(input.sessionId, input.node);
    const request = new Request("https://sandbox.internal/pty", {
      headers: { upgrade: "websocket" },
    });
    // The SDK adds `terminal()` to the stub at runtime; call the proxy it uses directly.
    const response = await proxyTerminal(
      sandbox,
      `sandbox-${sandboxName(input.sessionId, input.node)}`,
      request,
      { cols: input.cols, rows: input.rows },
    );
    const socket = response.webSocket;
    if (response.status !== 101 || socket === null) {
      throw new ProviderUnavailable(
        "pty_unavailable",
        `sandbox answered ${response.status} to the terminal upgrade`,
      );
    }
    socket.accept();
    return socket;
  }
}
