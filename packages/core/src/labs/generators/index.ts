import type { LabSpec, TopologyArchetype } from "@hivemind/schema";

import type { ResolvedParameters } from "../parameters";
import type { SeededRandom } from "../seed";
import { dualSpine, routeReflector } from "./bgp";
import { linuxPair, linuxSingle } from "./linux";

/*
 * Generators turn an archetype plus resolved parameters into a concrete
 * LabSpec. They are pure: no clocks, no randomness beyond the seeded stream
 * passed in, no I/O. A generator's behaviour is versioned through the
 * archetype version that names it (invariant 5); changing a generator's
 * output for existing archetypes requires bumping those archetype versions.
 */

export interface GeneratorInput {
  readonly archetype: TopologyArchetype;
  readonly parameters: ResolvedParameters;
  readonly random: SeededRandom;
}

export type TopologyGenerator = (input: GeneratorInput) => LabSpec;

export const GENERATORS: Readonly<Record<string, TopologyGenerator>> = {
  "linux.single": linuxSingle,
  "linux.pair": linuxPair,
  "bgp.dual_spine": dualSpine,
  "bgp.route_reflector": routeReflector,
};

export function generatorFor(id: string): TopologyGenerator {
  const generator = GENERATORS[id];
  if (generator === undefined) {
    throw new Error(`unknown topology generator: ${id}`);
  }
  return generator;
}

/** Lab-level fields every generator copies from the archetype. */
export function specEnvelope(
  archetype: TopologyArchetype,
): Pick<
  LabSpec,
  | "id"
  | "version"
  | "title"
  | "requires"
  | "resources"
  | "network"
  | "ttl_minutes"
  | "snapshot"
> {
  return {
    id: archetype.id,
    version: archetype.version,
    title: archetype.title,
    requires: [...archetype.requires],
    resources: { ...archetype.resources },
    network: {
      egress: archetype.network.egress,
      allowlist: [...archetype.network.allowlist],
    },
    ttl_minutes: archetype.ttl_minutes,
    snapshot: archetype.snapshot,
  };
}

export function imageFor(archetype: TopologyArchetype, role: string): string {
  const image = archetype.images[role];
  if (image === undefined) {
    throw new Error(`archetype ${archetype.id} declares no image for role ${role}`);
  }
  return image;
}
