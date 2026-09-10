import {
  hashCanonical,
  labSpecSchema,
  topologyArchetypeSchema,
  topologyInstanceSchema,
  type TopologyArchetype,
  type TopologyInstance,
} from "@hivemind/schema";

import { generatorFor } from "./generators/index";
import { resolveParameters } from "./parameters";
import { SeededRandom } from "./seed";

/*
 * (archetype, seed, overrides) → TopologyInstance. Deterministic: the same
 * archetype version and seed always yield the same spec hash (invariant 5).
 * The hash covers everything a provider consumes, so equal hashes are
 * identical labs and a changed generator shows up as a changed hash.
 */

export async function instantiateTopology(
  archetype: TopologyArchetype,
  seed: number,
  overrides: Readonly<Record<string, unknown>> = {},
): Promise<TopologyInstance> {
  const parsed = topologyArchetypeSchema.parse(archetype);
  const random = new SeededRandom(seed, `${parsed.id}@${parsed.version}`);
  const parameters = resolveParameters(parsed, random, overrides);
  const labSpec = labSpecSchema.parse(
    generatorFor(parsed.generator)({ archetype: parsed, parameters, random }),
  );
  const unhashed = {
    archetype_id: parsed.id,
    archetype_version: parsed.version,
    generator: parsed.generator,
    seed,
    parameters,
    lab_spec: labSpec,
  };
  return topologyInstanceSchema.parse({
    ...unhashed,
    spec_hash: await hashCanonical(unhashed),
  });
}

/** Nodes as the session summary presents them (name and role only). */
export function summarizeNodes(
  instance: TopologyInstance,
): { name: string; role: TopologyInstance["lab_spec"]["nodes"][number]["role"] }[] {
  return instance.lab_spec.nodes.map((node) => ({ name: node.name, role: node.role }));
}
