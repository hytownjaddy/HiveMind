import type { LabStatus } from "@hivemind/protocol";

/**
 * Lab providers satisfy capabilities (RFP §36, §106). The Durable Object owns
 * lifecycle, persistence, sockets, and alarms; a provider only answers two
 * questions: "what is the next provisioning step?" and "what does the
 * environment say back to terminal input?".
 *
 * Real providers (Docker, containerlab/FRR, microVM, Kubernetes) will run on
 * lab hosts outside Cloudflare and be driven over HTTP/WebSocket from here.
 */
export interface ProvisionStep {
  readonly next: LabStatus;
  readonly delayMs: number;
}

export interface LabProvider {
  readonly id: string;
  /** Next lifecycle step from `status`, or null when provisioning is complete. */
  provisionStep(status: LabStatus): ProvisionStep | null;
  /** Called when the session becomes ready. Returns text for the terminal. */
  banner(capability: string, problemRef: string | null): string;
  /** Terminal input arrived. Returns bytes to write back, if any. */
  handleInput(data: string, state: ProviderState): string | null;
}

/** Small per-session scratch state the object keeps on the provider's behalf. */
export interface ProviderState {
  lineBuffer: string;
}

const PROMPT = "\r\nhivemind:~$ ";
const DEL = String.fromCharCode(127);
const CTRL_C = String.fromCharCode(3);

/**
 * In-object stub used for local development and tests. It fakes a shell so the
 * whole browser -> gateway -> Durable Object -> terminal path can be exercised
 * without any lab host. Never ship real courses on this provider.
 */
export class EchoProvider implements LabProvider {
  readonly id = "echo";

  provisionStep(status: LabStatus): ProvisionStep | null {
    switch (status) {
      case "queued":
        return { next: "provisioning", delayMs: 150 };
      case "provisioning":
        return { next: "baseline_check", delayMs: 150 };
      case "baseline_check":
        return { next: "ready", delayMs: 150 };
      default:
        return null;
    }
  }

  banner(capability: string, problemRef: string | null): string {
    return (
      `\r\nHiveMind echo provider (dev stub)\r\n` +
      `capability: ${capability}\r\n` +
      `problem:    ${problemRef ?? "(none)"}\r\n` +
      `Type anything and press Enter. Try: help, status, exit` +
      PROMPT
    );
  }

  handleInput(data: string, state: ProviderState): string | null {
    let output = "";
    for (const char of data) {
      if (char === "\r" || char === "\n") {
        const line = state.lineBuffer.trim();
        state.lineBuffer = "";
        output += `\r\n${respond(line)}${PROMPT}`;
      } else if (char === DEL || char === "\b") {
        if (state.lineBuffer.length > 0) {
          state.lineBuffer = state.lineBuffer.slice(0, -1);
          output += "\b \b";
        }
      } else if (char === CTRL_C) {
        state.lineBuffer = "";
        output += `^C${PROMPT}`;
      } else if (char >= " ") {
        state.lineBuffer += char;
        output += char;
      }
    }
    return output.length > 0 ? output : null;
  }
}

function respond(line: string): string {
  if (line === "") {
    return "";
  }
  if (line === "help") {
    return "This is a stub shell. Real labs run on lab hosts (docker, containerlab, frr).";
  }
  if (line === "status") {
    return "echo provider: healthy";
  }
  if (line === "exit") {
    return "Use the Destroy button to tear the session down.";
  }
  return `echo: ${line}`;
}

export function resolveProvider(id: string): LabProvider {
  switch (id) {
    case "echo":
      return new EchoProvider();
    default:
      throw new Error(`Unknown LAB_PROVIDER "${id}"`);
  }
}
