import type { LabSpec, TopologyArchetype } from "@hivemind/schema";

import type { ResolvedParameters } from "../parameters";
import type { SeededRandom } from "../seed";

export interface GeneratorInput {
  readonly archetype: TopologyArchetype;
  readonly parameters: ResolvedParameters;
  readonly random: SeededRandom;
}

export type TopologyGenerator = (input: GeneratorInput) => LabSpec;

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
