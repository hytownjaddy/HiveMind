import { labSessionIdSchema, type SessionSummary } from "@hivemind/schema";

import type { HiveMindApi } from "../api";
import { optionFlag, optionList, optionString, type ParsedArgs } from "../args";
import type { CliConfig } from "../config";
import { CliError, type Output } from "../output";
import {
  attachTerminal,
  type InputStream,
  type OutputStream,
  type SocketLike,
} from "../terminal";

/*
 * hivemind lab up <archetype> [--seed n] [--param k=v]… [--ttl-minutes m] [--node name] [--no-attach] [--no-wait]
 * hivemind lab down <id> | --all
 * hivemind lab ls
 * hivemind lab attach <id> [--node name]
 * hivemind lab logs <id> [--follow]
 *
 * Everything goes through the session Worker (D-034): the CLI never talks to a
 * provider. `lab up` waits for `ready` and, on a TTY, attaches to the first node.
 */

export interface LabDeps {
  readonly config: CliConfig;
  readonly api: HiveMindApi;
  readonly out: Output;
  readonly now: () => string;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
  readonly connect?:
    ((url: string, headers: Record<string, string>) => SocketLike) | undefined;
  readonly stdin?: InputStream | undefined;
  readonly stdout?: OutputStream | undefined;
  readonly interactive?: boolean | undefined;
}

const POLL_MS = 500;
const FINAL = new Set(["destroyed", "failed"]);

function sleeper(deps: LabDeps): (ms: number) => Promise<void> {
  return deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
}

function requireId(args: ParsedArgs, index = 2): string {
  const raw = args.positionals[index];
  const parsed = labSessionIdSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError(
      `expected a session id like HM-LAB-000123, got ${raw ?? "(nothing)"}`,
    );
  }
  return parsed.data;
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

function describe(summary: SessionSummary): string {
  const nodes = summary.nodes
    .map((node) =>
      node.address === undefined ? node.name : `${node.name}=${node.address}`,
    )
    .join(", ");
  return `${summary.id} ${summary.status} · ${summary.archetype}@${summary.archetype_version} seed ${summary.seed} · ${summary.provider_id ?? "?"} (class ${summary.provider_class ?? "?"}) · nodes ${nodes}`;
}

/** Poll until the session leaves the given set of statuses; reports each change. */
async function waitUntil(
  deps: LabDeps,
  id: string,
  done: (summary: SessionSummary) => boolean,
  timeoutMs = 10 * 60_000,
): Promise<SessionSummary> {
  const sleep = sleeper(deps);
  const started = Date.now();
  let last = "";
  for (;;) {
    const summary = await deps.api.getLab(id);
    if (summary.status !== last) {
      deps.out.log(
        `${summary.id} ${summary.status}${summary.reason !== null && FINAL.has(summary.status) ? ` (${summary.reason})` : ""}`,
      );
      last = summary.status;
    }
    if (done(summary)) {
      return summary;
    }
    if (Date.now() - started > timeoutMs) {
      throw new CliError(
        `${id} still ${summary.status} after ${Math.round(timeoutMs / 1000)}s`,
      );
    }
    await sleep(POLL_MS);
  }
}

export async function labUp(args: ParsedArgs, deps: LabDeps): Promise<number> {
  const archetype = args.positionals[2];
  if (archetype === undefined) {
    throw new CliError("lab up needs an archetype id (hivemind topology list)");
  }
  const seedRaw = optionString(args, "seed");
  const seed = seedRaw === undefined ? 1 : Number(seedRaw);
  if (!Number.isInteger(seed) || seed < 0) {
    throw new CliError("--seed must be a non-negative integer");
  }
  const ttlRaw = optionString(args, "ttl-minutes");
  const parameters = parseParams(args);
  const created = await deps.api.createLab({
    archetype,
    seed,
    ...(Object.keys(parameters).length === 0 ? {} : { parameters }),
    ...(ttlRaw === undefined ? {} : { ttl_minutes: Number(ttlRaw) }),
  });
  deps.out.log(describe(created));
  if (optionFlag(args, "no-wait")) {
    return 0;
  }
  const started = Date.now();
  const summary = await waitUntil(
    deps,
    created.id,
    (s) => s.status === "ready" || s.status === "active" || FINAL.has(s.status),
  );
  if (FINAL.has(summary.status)) {
    deps.out.error(`${summary.id} ${summary.status}: ${summary.reason ?? "no reason"}`);
    return 1;
  }
  deps.out.log(
    `${describe(summary)} · ready in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  const interactive =
    deps.interactive ?? (process.stdin.isTTY === true && process.stdout.isTTY === true);
  if (optionFlag(args, "no-attach") || !interactive) {
    deps.out.log(`hivemind lab attach ${summary.id}`);
    return 0;
  }
  return attach(deps, summary, optionString(args, "node"));
}

export async function labAttach(args: ParsedArgs, deps: LabDeps): Promise<number> {
  const id = requireId(args);
  const summary = await deps.api.getLab(id);
  if (FINAL.has(summary.status)) {
    throw new CliError(`${id} is ${summary.status}`);
  }
  return attach(deps, summary, optionString(args, "node"));
}

async function attach(
  deps: LabDeps,
  summary: SessionSummary,
  requestedNode: string | undefined,
): Promise<number> {
  const node = requestedNode ?? summary.nodes[0]?.name;
  if (node === undefined || !summary.nodes.some((n) => n.name === node)) {
    throw new CliError(
      `no node ${requestedNode ?? "(none)"}; nodes: ${summary.nodes.map((n) => n.name).join(", ")}`,
    );
  }
  const { url, headers } = deps.api.labSocket(summary.id);
  const connect = deps.connect ?? defaultConnect;
  const outcome = await attachTerminal({
    node,
    socket: connect(url, headers),
    stdin: deps.stdin ?? (process.stdin as unknown as InputStream),
    stdout: deps.stdout ?? (process.stdout as unknown as OutputStream),
    log: (line) => deps.out.error(line),
  });
  switch (outcome.kind) {
    case "exit":
      deps.out.error(`\r\n${node}: shell exited ${outcome.code ?? "?"}`);
      return 0;
    case "detached":
      deps.out.error(
        `\r\ndetached from ${summary.id}; hivemind lab attach ${summary.id} resumes it`,
      );
      return 0;
    case "finished":
      deps.out.error(`\r\nsession ended: ${outcome.reason}`);
      return 0;
    case "rejected":
      deps.out.error(
        `\r\nrejected: ${outcome.code}${outcome.detail === undefined ? "" : ` (${outcome.detail})`}`,
      );
      return 1;
  }
}

function defaultConnect(url: string, headers: Record<string, string>): SocketLike {
  // Bun's WebSocket accepts custom headers (service token, origin).
  const BunSocket = WebSocket as unknown as new (
    url: string,
    options: { headers: Record<string, string> },
  ) => SocketLike;
  return new BunSocket(url, { headers });
}

export async function labDown(args: ParsedArgs, deps: LabDeps): Promise<number> {
  const ids = optionFlag(args, "all")
    ? (await deps.api.listLabs()).sessions
        .filter((s) => !FINAL.has(s.status))
        .map((s) => s.id)
    : [requireId(args)];
  if (ids.length === 0) {
    deps.out.log("no running labs");
    return 0;
  }
  let failed = 0;
  for (const id of ids) {
    await deps.api.destroyLab(id);
    const final = await waitUntil(deps, id, (s) => FINAL.has(s.status), 3 * 60_000);
    if (final.status !== "destroyed") {
      failed += 1;
    }
  }
  return failed === 0 ? 0 : 1;
}

export async function labLs(_args: ParsedArgs, deps: LabDeps): Promise<number> {
  const { sessions } = await deps.api.listLabs();
  if (sessions.length === 0) {
    deps.out.log("no labs yet · hivemind lab up linux.single --seed 1");
    return 0;
  }
  for (const session of sessions) {
    const nodes = session.nodes.map((node) => node.name).join(",") || "-";
    deps.out.log(
      `${session.id}  ${session.status.padEnd(14)}  ${session.archetype ?? "?"}@${session.archetype_version ?? "?"} seed ${session.seed ?? "?"}  ${session.provider_id ?? "-"} (${session.provider_class ?? "-"})  nodes ${nodes}  ${session.updated_at}`,
    );
  }
  return 0;
}

export async function labLogs(args: ParsedArgs, deps: LabDeps): Promise<number> {
  const id = requireId(args);
  const follow = optionFlag(args, "follow");
  const sleep = sleeper(deps);
  let after = 0;
  for (;;) {
    const { session, events } = await deps.api.labEvents(id, after);
    for (const entry of events) {
      const event = entry.event;
      const text =
        event.type === "status_changed"
          ? `${event.from} → ${event.to}${event.reason === undefined ? "" : ` (${event.reason})`}`
          : event.type === "notice"
            ? event.text
            : event.type === "log"
              ? `[${event.level}] ${event.message}`
              : "";
      deps.out.log(`${entry.at}  #${entry.sequence}  ${text}`);
      after = entry.sequence;
    }
    if (!follow || FINAL.has(session.status)) {
      return 0;
    }
    await sleep(1_000);
  }
}
