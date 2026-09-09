import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HiveMindApi } from "../api";
import { optionFlag, optionString, type ParsedArgs } from "../args";
import type { CliConfig } from "../config";
import type { Output } from "../output";

/*
 * hivemind export [--out dir] [--sql local|remote|production]
 * Writes the portable archive (learners, content versions, work orders,
 * attempts) as JSON and, with --sql, a `wrangler d1 export` dump beside it (D-020).
 */

export interface ExportDeps {
  readonly config: CliConfig;
  readonly api: HiveMindApi;
  readonly out: Output;
  readonly now: () => string;
  readonly wrangler?: ((args: string[], cwd: string) => void) | undefined;
}

export async function exportArchive(args: ParsedArgs, deps: ExportDeps): Promise<number> {
  const stamp = deps
    .now()
    .replace(/[:]/gu, "")
    .replace(/\.\d+Z$/u, "Z");
  const outDir =
    optionString(args, "out") ?? join(deps.config.root, ".hivemind", "exports", stamp);
  mkdirSync(outDir, { recursive: true });
  const archive = await deps.api.exportArchive();
  const archivePath = join(outDir, "archive.json");
  writeFileSync(archivePath, `${JSON.stringify(archive, null, 2)}\n`);
  deps.out.log(`archive → ${archivePath}`);
  const sql =
    optionString(args, "sql") ?? (optionFlag(args, "sql") ? "local" : undefined);
  if (sql !== undefined) {
    const target =
      sql === "local"
        ? ["--local"]
        : sql === "production"
          ? ["--remote", "--env", "production"]
          : ["--remote"];
    const sqlPath = join(outDir, "d1.sql");
    const run = deps.wrangler ?? defaultWrangler;
    run(
      [
        "d1",
        "export",
        "DB",
        ...target,
        "--output",
        sqlPath,
        "-c",
        "apps/web/wrangler.jsonc",
      ],
      deps.config.root,
    );
    deps.out.log(`d1 dump → ${sqlPath}`);
  }
  return 0;
}

function defaultWrangler(args: string[], cwd: string): void {
  execSync(`bunx wrangler ${args.map((arg) => JSON.stringify(arg)).join(" ")}`, {
    cwd,
    stdio: "inherit",
  });
}
