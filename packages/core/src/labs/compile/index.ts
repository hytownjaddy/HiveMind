import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { topologyArchetypeSchema, type TopologyArchetype } from "@hivemind/schema";
import { parse as parseYaml } from "yaml";

import { ArchetypeRegistry } from "../archetypes";

/*
 * Node-only: reads `content/topologies/*.yaml`, validates every archetype,
 * checks that its generator exists and that every image is pinned, and
 * produces the JSON the Workers bundle (`archetypes.generated.json`). Never
 * imported by a Worker (dependency-cruiser `labs-compile-is-node-only`).
 */

export const TOPOLOGIES_DIR = "content/topologies";
export const GENERATED_FILE = "packages/core/src/labs/archetypes.generated.json";

export interface CompiledArchetypes {
  readonly archetypes: readonly TopologyArchetype[];
  readonly errors: readonly string[];
}

const PINNED = /@sha256:[a-f0-9]{64}$/u;
/** Locally built lab images carry an immutable version tag instead of a registry digest. */
const LOCAL_IMAGE = /^hivemind\/[a-z0-9-]+:\d+\.\d+\.\d+$/u;

export function compileArchetypes(
  root: string,
  generatorIds: readonly string[],
): CompiledArchetypes {
  const dir = join(root, TOPOLOGIES_DIR);
  const errors: string[] = [];
  const archetypes: TopologyArchetype[] = [];
  for (const name of readdirSync(dir)
    .filter((file) => file.endsWith(".yaml"))
    .sort()) {
    const path = `${TOPOLOGIES_DIR}/${name}`;
    const parsed = topologyArchetypeSchema.safeParse(
      parseYaml(readFileSync(join(dir, name), "utf8")),
    );
    if (!parsed.success) {
      errors.push(
        `${path}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      );
      continue;
    }
    const archetype = parsed.data;
    if (name !== `${archetype.id}.yaml`) {
      errors.push(`${path}: file name must be ${archetype.id}.yaml`);
    }
    if (!generatorIds.includes(archetype.generator)) {
      errors.push(`${path}: unknown generator ${archetype.generator}`);
    }
    for (const [role, image] of Object.entries(archetype.images)) {
      if (!PINNED.test(image) && !LOCAL_IMAGE.test(image)) {
        errors.push(
          `${path}: image for role ${role} must be pinned by digest or be a versioned hivemind/* image`,
        );
      }
    }
    archetypes.push(archetype);
  }
  if (errors.length === 0) {
    try {
      new ArchetypeRegistry(archetypes);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { archetypes, errors };
}

export function serializeArchetypes(archetypes: readonly TopologyArchetype[]): string {
  return `${JSON.stringify(archetypes, null, 2)}\n`;
}

/** Differences between the YAML sources and the committed JSON; empty when in sync. */
export function checkGenerated(root: string, generatorIds: readonly string[]): string[] {
  const compiled = compileArchetypes(root, generatorIds);
  if (compiled.errors.length > 0) {
    return [...compiled.errors];
  }
  let current = "";
  try {
    current = readFileSync(join(root, GENERATED_FILE), "utf8");
  } catch {
    return [`${GENERATED_FILE} is missing; run hivemind topology compile`];
  }
  return current === serializeArchetypes(compiled.archetypes)
    ? []
    : [`${GENERATED_FILE} is out of date; run hivemind topology compile`];
}
