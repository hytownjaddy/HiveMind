import { dualSpine, routeReflector } from "./bgp";
import { linuxPair, linuxSingle } from "./linux";
import type { TopologyGenerator } from "./shared";

/*
 * Generators turn an archetype plus resolved parameters into a concrete
 * LabSpec. They are pure: no clocks, no randomness beyond the seeded stream
 * passed in, no I/O. A generator's behaviour is versioned through the
 * archetype version that names it (invariant 5); changing a generator's
 * output for existing archetypes requires bumping those archetype versions.
 */

export * from "./shared";

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
