import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  GENERATORS,
  defaultArchetypeRegistry,
  instantiateTopology,
  summarizeNodes,
} from "@hivemind/core";
import {
  GENERATED_FILE,
  checkGenerated,
  compileArchetypes,
  serializeArchetypes,
} from "@hivemind/core/labs-compile";

import { optionFlag, optionList, optionString, type ParsedArgs } from "../args";
import type { CliConfig } from "../config";
import { CliError, type Output } from "../output";

/*
 * hivemind topology compile [--check]                 content/topologies → archetypes.generated.json
 * hivemind topology list                              archetypes bundled into this build
 * hivemind topology render <archetype> --seed n [--param k=v]… [--out file]
 *                                                     instantiate deterministically and print the TopologyInstance
 */

export interface TopologyDeps {
  readonly config: CliConfig;
  readonly out: Output;
}

const generatorIds = (): string[] => Object.keys(GENERATORS);

export async function topologyCompile(
  args: ParsedArgs,
  deps: TopologyDeps,
): Promise<number> {
  if (optionFlag(args, "check")) {
    const problems = checkGenerated(deps.config.root, generatorIds());
    for (const problem of problems) {
      deps.out.error(`topology compile: ${problem}`);
    }
    if (problems.length === 0) {
      deps.out.log(`topology compile: ${GENERATED_FILE} is in sync`);
    }
    return problems.length === 0 ? 0 : 1;
  }
  const compiled = compileArchetypes(deps.config.root, generatorIds());
  for (const error of compiled.errors) {
    deps.out.error(`topology compile: ${error}`);
  }
  if (compiled.errors.length > 0) {
    return 1;
  }
  writeFileSync(
    join(deps.config.root, GENERATED_FILE),
    serializeArchetypes(compiled.archetypes),
  );
  deps.out.log(
    `topology compile: ${compiled.archetypes.length} archetypes → ${GENERATED_FILE}`,
  );
  return 0;
}

export async function topologyList(
  _args: ParsedArgs,
  deps: TopologyDeps,
): Promise<number> {
  for (const archetype of defaultArchetypeRegistry().list()) {
    const aliases =
      archetype.aliases.length > 0 ? ` (${archetype.aliases.join(", ")})` : "";
    deps.out.log(
      `${archetype.id}@${archetype.version}${aliases}  requires ${archetype.requires.join(", ")}  ${archetype.title}`,
    );
  }
  return 0;
}

function parseParams(args: ParsedArgs): Record<string, unknown> {
  const parameters: Record<string, unknown> = {};
  for (const raw of optionList(args, "param")) {
    const [key, value] = raw.split("=");
    if (key === undefined || value === undefined || key.length === 0) {
      throw new CliError(`--param expects key=value, got ${raw}`);
    }
    parameters[key] =
      value === "true"
        ? true
        : value === "false"
          ? false
          : /^\d+$/u.test(value)
            ? Number(value)
            : value;
  }
  return parameters;
}

export async function topologyRender(
  args: ParsedArgs,
  deps: TopologyDeps,
): Promise<number> {
  const id = args.positionals[2];
  if (id === undefined) {
    throw new CliError("topology render needs an archetype id");
  }
  const archetype = defaultArchetypeRegistry().resolve(id);
  if (archetype === null) {
    throw new CliError(`unknown archetype ${id}; try hivemind topology list`);
  }
  const seedRaw = optionString(args, "seed");
  const seed = seedRaw === undefined ? 1 : Number(seedRaw);
  if (!Number.isInteger(seed) || seed < 0) {
    throw new CliError("--seed must be a non-negative integer");
  }
  const instance = await instantiateTopology(archetype, seed, parseParams(args));
  const text = `${JSON.stringify(instance, null, 2)}\n`;
  const outPath = optionString(args, "out");
  if (outPath !== undefined) {
    writeFileSync(outPath, text);
    deps.out.log(
      `${instance.archetype_id}@${instance.archetype_version} seed ${seed} → ${outPath} (${summarizeNodes(instance).length} nodes, hash ${instance.spec_hash.slice(0, 12)})`,
    );
  } else {
    deps.out.log(text.trimEnd());
  }
  return 0;
}
