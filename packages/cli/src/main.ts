#!/usr/bin/env bun
import { isoNow } from "@hivemind/core";

import { ApiError, HiveMindApi } from "./api";
import { parseArgs, type ParsedArgs } from "./args";
import {
  contentApprove,
  contentCompile,
  contentDiff,
  contentPublish,
} from "./commands/content";
import { dbMigrate } from "./commands/db";
import { exportArchive } from "./commands/export";
import { labAttach, labDown, labLogs, labLs, labUp } from "./commands/lab";
import { topologyCompile, topologyList, topologyRender } from "./commands/topology";
import { workComplete, workList, workNew, workPull, workValidate } from "./commands/work";
import { loadConfig, type CliConfig } from "./config";
import { CliError, consoleOutput, type Output } from "./output";

/*
 * `hivemind` (D-034): content, work orders, export, database, topology, and
 * lab commands. Lab commands invoke the worker protocol through the session
 * Worker; the CLI never reaches a provider directly.
 */

const USAGE = `hivemind <group> <command> [options]

  content compile [dir] [--out file]
  content diff [dir]
  content publish [dir] [--note text] [--sql-out file]
  content approve <lesson-id> --by <name> [--publish]
  work new <template> --lesson <id> | --module <course> --module <module> | --course <id> | --skill <id> | --problem <id> | --area <a>
           [--instructions text] [--title text] [--priority p] [--label l]…
  work pull [id] [--no-start]
  work validate <id> [--skip-commands]
  work complete <id> --summary text [--files a,b] [--commit sha]
  work list [--status s]
  export [--out dir] [--sql local|remote|production]
  db migrate [--local|--remote|--production] [--down nnnn]
  topology compile [--check]
  topology list
  topology render <archetype> --seed n [--param k=v]… [--out file]
  lab up <archetype> [--seed n] [--param k=v]… [--ttl-minutes m] [--node name] [--no-attach] [--no-wait]
  lab down <id> | --all
  lab ls
  lab attach <id> [--node name]
  lab logs <id> [--follow]

Environment: HIVEMIND_API_URL, HIVEMIND_SESSION_URL, HIVEMIND_ACCESS_CLIENT_ID, HIVEMIND_ACCESS_CLIENT_SECRET, HIVEMIND_ACTOR, HIVEMIND_ROOT
`;

export interface RunDeps {
  readonly config: CliConfig;
  readonly api: HiveMindApi;
  readonly out: Output;
  readonly now: () => string;
}

type Handler = (args: ParsedArgs, deps: RunDeps) => Promise<number>;

const COMMANDS: Readonly<Record<string, Handler>> = {
  "content compile": contentCompile,
  "content diff": contentDiff,
  "content publish": contentPublish,
  "content approve": contentApprove,
  "work new": workNew,
  "work pull": workPull,
  "work validate": workValidate,
  "work complete": workComplete,
  "work list": workList,
  export: (args, deps) => exportArchive(args, deps),
  "db migrate": dbMigrate,
  "topology compile": topologyCompile,
  "topology list": topologyList,
  "topology render": topologyRender,
  "lab up": labUp,
  "lab down": labDown,
  "lab ls": labLs,
  "lab attach": labAttach,
  "lab logs": labLogs,
};

export async function run(argv: readonly string[], deps: RunDeps): Promise<number> {
  const args = parseArgs(argv);
  const [group, command] = args.positionals;
  if (group === undefined || group === "help" || args.options["help"] === true) {
    deps.out.log(USAGE);
    return group === undefined ? 1 : 0;
  }
  const key = group === "export" ? "export" : `${group} ${command ?? ""}`.trim();
  const handler = COMMANDS[key];
  if (handler === undefined) {
    deps.out.error(`unknown command: ${key}\n\n${USAGE}`);
    return 1;
  }
  // `export` has no sub-command; shift positionals so handlers see a uniform shape.
  const normalized =
    group === "export"
      ? { ...args, positionals: ["export", "archive", ...args.positionals.slice(1)] }
      : args;
  try {
    return await handler(normalized, deps);
  } catch (error) {
    if (error instanceof CliError) {
      deps.out.error(error.message);
      return error.exitCode;
    }
    if (error instanceof ApiError) {
      deps.out.error(`api: ${error.message}`);
      return 2;
    }
    throw error;
  }
}

if (import.meta.main) {
  const config = loadConfig();
  const code = await run(process.argv.slice(2), {
    config,
    api: new HiveMindApi(config),
    out: consoleOutput,
    now: () => isoNow(),
  });
  process.exit(code);
}
