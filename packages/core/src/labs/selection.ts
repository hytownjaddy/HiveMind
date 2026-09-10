import {
  KNOWN_CAPABILITIES,
  satisfiesCapabilities,
  type Capability,
  type ExecutionClass,
  type LabProviderDescriptor,
} from "@hivemind/schema";

/*
 * Capability-based provider selection (D-035, invariant 17). A lab declares
 * what it needs; the registry lists what each provider offers; this function
 * picks one or explains why none fits. Class B capabilities can only ever be
 * offered by a lab worker (Sandbox is rootless), which the registry enforces
 * by construction: the Sandbox descriptor never lists them.
 *
 * Class C policy: a spec satisfiable by both kinds is placed on the kind named
 * by `CLASS_C_PREFERENCE`, the recorded outcome of the Stage 02 benchmark
 * (docs/benchmarks/class-c.md, DECISIONS.md). It is data, not a rule, and is
 * revisited by re-running the benchmark.
 */

export type ProviderKind = LabProviderDescriptor["kind"];

export interface ProviderCandidate {
  readonly descriptor: LabProviderDescriptor;
  /** Whether the provider is currently reachable; offline candidates are skipped. */
  readonly online: boolean;
  /** Fewer active sessions wins among equal candidates. */
  readonly activeSessions: number;
}

export type Selection =
  | {
      readonly ok: true;
      readonly provider: LabProviderDescriptor;
      readonly executionClass: ExecutionClass;
    }
  | {
      readonly ok: false;
      readonly code: "unsatisfiable" | "no_provider_online";
      readonly message: string;
      readonly unsatisfied: readonly Capability[];
    };

export const CLASS_C_PREFERENCE: readonly ProviderKind[] = ["lab_worker", "sandbox"];

const KNOWN_CLASS = new Map(KNOWN_CAPABILITIES.map((c) => [c.id, c.class] as const));

/** The execution class a set of requirements implies: B if any Class B capability, else A/C. */
export function executionClassOf(requires: readonly Capability[]): ExecutionClass {
  const classes = requires.map((capability) => KNOWN_CLASS.get(capability) ?? "B");
  if (classes.includes("B")) {
    return "B";
  }
  return classes.every((c) => c === "C") ? "C" : "A";
}

export function selectProvider(
  requires: readonly Capability[],
  candidates: readonly ProviderCandidate[],
  preference: readonly ProviderKind[] = CLASS_C_PREFERENCE,
): Selection {
  const capable = candidates.filter((candidate) =>
    satisfiesCapabilities(requires, candidate.descriptor.capabilities),
  );
  if (capable.length === 0) {
    const offered = new Set(
      candidates.flatMap((candidate) => candidate.descriptor.capabilities),
    );
    const unsatisfied = requires.filter((capability) => !offered.has(capability));
    return {
      ok: false,
      code: "unsatisfiable",
      message:
        unsatisfied.length > 0
          ? `no provider offers ${unsatisfied.join(", ")}`
          : `no single provider offers all of ${requires.join(", ")}`,
      unsatisfied,
    };
  }
  const online = capable.filter((candidate) => candidate.online);
  if (online.length === 0) {
    return {
      ok: false,
      code: "no_provider_online",
      message: `${capable.map((c) => c.descriptor.id).join(", ")} can run this lab but none is online`,
      unsatisfied: [],
    };
  }
  const executionClass = executionClassOf(requires);
  const rank = (kind: ProviderKind): number => {
    const index = preference.indexOf(kind);
    return index === -1 ? preference.length : index;
  };
  const [best] = [...online].sort((a, b) => {
    if (executionClass === "C") {
      const byPreference = rank(a.descriptor.kind) - rank(b.descriptor.kind);
      if (byPreference !== 0) {
        return byPreference;
      }
    }
    return (
      a.activeSessions - b.activeSessions ||
      a.descriptor.id.localeCompare(b.descriptor.id)
    );
  });
  return { ok: true, provider: (best as ProviderCandidate).descriptor, executionClass };
}
