import { FINAL_STATUSES, type LabStatus } from "@hivemind/schema";

/*
 * RFP §86 lifecycle as a graph (D-038). The LabSession object applies these
 * rules; providers only report what they did. `failed` and `destroying` are
 * reachable from every non-final state so a lost worker or a learner's
 * request can always end a session; nothing leaves `destroyed` or `failed`.
 */

const FORWARD: Readonly<Record<LabStatus, readonly LabStatus[]>> = {
  queued: ["provisioning"],
  provisioning: ["baseline_check", "ready"],
  baseline_check: ["fault_injection", "ready"],
  fault_injection: ["fault_check"],
  fault_check: ["ready"],
  ready: ["active", "grading"],
  active: ["grading", "ready"],
  grading: ["completed", "active"],
  completed: [],
  destroying: ["destroyed"],
  destroyed: [],
  failed: [],
};

export function isFinalStatus(status: LabStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

export function canTransition(from: LabStatus, to: LabStatus): boolean {
  if (from === to) {
    return false;
  }
  if (isFinalStatus(from)) {
    return false;
  }
  if (to === "failed") {
    return true;
  }
  if (to === "destroying") {
    return from !== "destroying";
  }
  return FORWARD[from].includes(to);
}

/** Provider-reported progress the object accepts while provisioning. */
export const PROVIDER_PROGRESS_STATUSES: readonly LabStatus[] = [
  "provisioning",
  "baseline_check",
  "fault_injection",
  "fault_check",
  "destroying",
];

/** Whether terminals may be used in this state. */
export function acceptsTerminalInput(status: LabStatus): boolean {
  return status === "ready" || status === "active";
}

/** Job timeout for a provider that reports asynchronously, by topology size. */
export function provisionTimeoutMs(nodeCount: number): number {
  return Math.min(600_000, 60_000 + 45_000 * Math.max(1, nodeCount));
}

export const DESTROY_TIMEOUT_MS = 90_000;
