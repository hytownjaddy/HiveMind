import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseWorkOrderFile,
  validateWorkOrderFile,
  WORK_ORDER_DIR,
  workOrderFileName,
} from "@hivemind/core";
import {
  WORK_ORDER_TEMPLATES,
  workOrderIdSchema,
  workOrderStatusSchema,
  workOrderTemplateSchema,
  type WorkOrder,
  type WorkOrderTarget,
} from "@hivemind/schema";

import type { HiveMindApi } from "../api";
import { optionFlag, optionList, optionString, type ParsedArgs } from "../args";
import { changedFiles, gitCommit, type CliConfig } from "../config";
import { CliError, type Output } from "../output";

/*
 * hivemind work new <template> (--lesson id | --module course module | --course id | --skill id | --problem id | --area a)
 *                  [--instructions text] [--title text] [--priority low|normal|high] [--label x]…
 * hivemind work pull [id] [--no-start]     write exported orders to .hivemind/work-orders/ and start them
 * hivemind work validate <id> [--skip-commands]
 * hivemind work complete <id> --summary text [--files a,b] [--commit sha]
 * hivemind work list [--status s]
 */

export interface WorkDeps {
  readonly config: CliConfig;
  readonly api: HiveMindApi;
  readonly out: Output;
  readonly now: () => string;
  readonly runCommand?:
    ((command: string, cwd: string) => { exit_code: number; output: string }) | undefined;
}

function workOrderDir(config: CliConfig): string {
  return join(config.root, WORK_ORDER_DIR);
}

function writeOrderFile(config: CliConfig, id: string, file: string): string {
  const dir = workOrderDir(config);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, workOrderFileName(id));
  writeFileSync(path, file);
  return path;
}

function requireId(args: ParsedArgs, index = 2): string {
  const raw = args.positionals[index];
  const parsed = workOrderIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError(
      `expected a work-order id like HM-WO-0184, got ${raw ?? "(nothing)"}`,
    );
  }
  return parsed.data;
}

function targetFromArgs(args: ParsedArgs): WorkOrderTarget {
  const lesson = optionString(args, "lesson");
  if (lesson !== undefined) {
    return { kind: "lesson", lesson_id: lesson };
  }
  const moduleValues = optionList(args, "module");
  if (moduleValues.length > 0) {
    const [course, moduleId] =
      moduleValues.length >= 2 ? moduleValues : (moduleValues[0] ?? "").split("/");
    if (course === undefined || moduleId === undefined || moduleId.length === 0) {
      throw new CliError(
        "--module needs a course id and a module id (--module <course> --module <module>, or <course>/<module>)",
      );
    }
    return { kind: "module", course_id: course, module_id: moduleId };
  }
  const course = optionString(args, "course");
  if (course !== undefined) {
    return { kind: "course", course_id: course };
  }
  const skill = optionString(args, "skill");
  if (skill !== undefined) {
    return { kind: "skill", skill_id: skill };
  }
  const problem = optionString(args, "problem");
  if (problem !== undefined) {
    return { kind: "problem", problem_id: problem };
  }
  const area = optionString(args, "area");
  if (area !== undefined) {
    return { kind: "platform", area };
  }
  throw new CliError(
    "a target is required: --lesson, --module, --course, --skill, --problem, or --area",
  );
}

export async function workNew(args: ParsedArgs, deps: WorkDeps): Promise<number> {
  const template = workOrderTemplateSchema.safeParse(args.positionals[2]);
  if (!template.success) {
    throw new CliError(`template must be one of ${WORK_ORDER_TEMPLATES.join(", ")}`);
  }
  const priority = optionString(args, "priority");
  const { order } = await deps.api.createWorkOrder({
    template: template.data,
    target: targetFromArgs(args),
    instructions: optionString(args, "instructions") ?? "",
    ...(optionString(args, "title") === undefined
      ? {}
      : { title: optionString(args, "title") as string }),
    ...(priority === undefined ? {} : { priority: priority as WorkOrder["priority"] }),
    labels: optionList(args, "label"),
  });
  const exported = await deps.api.exportWorkOrder(order.id);
  const path = writeOrderFile(deps.config, order.id, exported.file);
  deps.out.log(`${order.id} ${exported.order.status}: ${order.title}`);
  deps.out.log(`written ${path}`);
  return 0;
}

export async function workPull(args: ParsedArgs, deps: WorkDeps): Promise<number> {
  const id = args.positionals[2];
  const start = !optionFlag(args, "no-start");
  const orders =
    id === undefined
      ? (await deps.api.listWorkOrders("exported")).orders
      : [(await deps.api.getWorkOrder(requireId(args))).order];
  if (orders.length === 0) {
    deps.out.log("no exported work orders");
    return 0;
  }
  for (const order of orders) {
    let current = order;
    if (current.status === "draft") {
      current = (await deps.api.exportWorkOrder(current.id)).order;
    }
    if (start && current.status === "exported") {
      current = (
        await deps.api.transitionWorkOrder(
          current.id,
          "in_progress",
          "pulled by hivemind work pull",
        )
      ).order;
    }
    const { file } = await deps.api.exportWorkOrder(current.id);
    const path = writeOrderFile(deps.config, current.id, file);
    deps.out.log(`${current.id} ${current.status}: ${current.title} → ${path}`);
  }
  return 0;
}

export async function workValidate(args: ParsedArgs, deps: WorkDeps): Promise<number> {
  const id = requireId(args);
  const path = join(workOrderDir(deps.config), workOrderFileName(id));
  if (!existsSync(path)) {
    throw new CliError(`no file ${path}; run hivemind work pull ${id}`);
  }
  const parsed = parseWorkOrderFile(readFileSync(path, "utf8"));
  if (!parsed.ok) {
    deps.out.error(`invalid: ${parsed.error}`);
    return 1;
  }
  const problems = validateWorkOrderFile(parsed.file);
  for (const problem of problems) {
    deps.out.error(`invalid: ${problem}`);
  }
  if (problems.length > 0) {
    return 1;
  }
  if (optionFlag(args, "skip-commands")) {
    deps.out.log(`${id}: file is valid (commands skipped)`);
    return 0;
  }
  const run = deps.runCommand ?? defaultRunCommand;
  let failed = false;
  const summaries: string[] = [];
  for (const command of parsed.file.order.context.validation_commands) {
    deps.out.log(`$ ${command}`);
    const outcome = run(command, deps.config.root);
    summaries.push(`${command} → exit ${outcome.exit_code}`);
    if (outcome.exit_code !== 0) {
      failed = true;
      deps.out.error(outcome.output.slice(-2000));
      break;
    }
  }
  const remote = await deps.api.getWorkOrder(id);
  if (remote.order.status === "implemented") {
    const { order } = await deps.api.recordValidation(id, {
      at: deps.now(),
      command: parsed.file.order.context.validation_commands.join(" && "),
      exit_code: failed ? 1 : 0,
      summary: summaries.join("; ").slice(0, 2000),
    });
    deps.out.log(`${id}: ${order.status}`);
  } else {
    deps.out.log(
      `${id}: validation ${failed ? "failed" : "passed"} (status ${remote.order.status} unchanged; runs are recorded once implemented)`,
    );
  }
  return failed ? 1 : 0;
}

function defaultRunCommand(
  command: string,
  cwd: string,
): { exit_code: number; output: string } {
  try {
    const output = execSync(command, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      shell: "/bin/sh",
    });
    return { exit_code: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exit_code: failure.status ?? 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

export async function workComplete(args: ParsedArgs, deps: WorkDeps): Promise<number> {
  const id = requireId(args);
  const summary = optionString(args, "summary");
  if (summary === undefined || summary.trim().length === 0) {
    throw new CliError("--summary is required");
  }
  const files = optionList(args, "files")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const commit = optionString(args, "commit") ?? gitCommit(deps.config.root);
  const { order } = await deps.api.completeWorkOrder(id, {
    written_at: deps.now(),
    summary,
    files_changed: files.length > 0 ? files : changedFiles(deps.config.root),
    ...(commit === undefined ? {} : { commit }),
  });
  const { file } = await deps.api.exportWorkOrder(id);
  writeOrderFile(deps.config, id, file);
  deps.out.log(`${id}: ${order.status}`);
  return 0;
}

export async function workList(args: ParsedArgs, deps: WorkDeps): Promise<number> {
  const statusRaw = optionString(args, "status");
  const status =
    statusRaw === undefined ? undefined : workOrderStatusSchema.parse(statusRaw);
  const { orders } = await deps.api.listWorkOrders(status);
  if (orders.length === 0) {
    deps.out.log("no work orders");
    return 0;
  }
  for (const order of orders) {
    deps.out.log(
      `${order.id}  ${order.status.padEnd(17)}  ${order.template.padEnd(16)}  ${order.title}`,
    );
  }
  const local = existsSync(workOrderDir(deps.config))
    ? readdirSync(workOrderDir(deps.config)).filter(
        (name) => name.endsWith(".md") && name !== "README.md",
      )
    : [];
  deps.out.log(`${orders.length} order(s); ${local.length} file(s) in ${WORK_ORDER_DIR}`);
  return 0;
}
