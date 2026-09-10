import type { TopologyArchetype } from "@hivemind/schema";

import generated from "./archetypes.generated.json";
import { ArchetypeRegistry } from "./archetypes";

/*
 * The archetypes bundled into the Workers and the CLI. Source of truth is
 * `content/topologies/*.yaml`; `hivemind topology compile` regenerates the
 * JSON and `bun run test:unit` fails on drift.
 */

export const ARCHETYPES: readonly TopologyArchetype[] = generated as TopologyArchetype[];

let registry: ArchetypeRegistry | null = null;

export function defaultArchetypeRegistry(): ArchetypeRegistry {
  registry ??= new ArchetypeRegistry(ARCHETYPES);
  return registry;
}
