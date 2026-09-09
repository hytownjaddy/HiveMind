import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { optionFlag, optionString, type ParsedArgs } from "../args";
import type { CliConfig } from "../config";
import { CliError, type Output } from "../output";

/*
 * hivemind db migrate [--local|--remote|--production] [--down nnnn]
 * Wraps wrangler: `d1 migrations apply` for up, and for down the matching
 * apps/web/migrations/down/<nnnn>_*.down.sql plus removal of the migration row
 * so the migration can be applied again (Stage 01 rollback requirements).
 */

export interface DbDeps {
  readonly config: CliConfig;
  readonly out: Output;
  readonly wrangler?: ((args: string[], cwd: string) => void) | undefined;
}

export const MIGRATIONS_DIR = "apps/web/migrations";

function targetArgs(args: ParsedArgs): string[] {
  if (optionFlag(args, "production")) {
    return ["--remote", "--env", "production"];
  }
  if (optionFlag(args, "remote")) {
    return ["--remote"];
  }
  return ["--local"];
}

export function downScriptFor(
  root: string,
  sequence: string,
): { file: string; migration: string } {
  const downDir = join(root, MIGRATIONS_DIR, "down");
  const file = existsSync(downDir)
    ? readdirSync(downDir).find(
        (name) => name.startsWith(`${sequence}_`) && name.endsWith(".down.sql"),
      )
    : undefined;
  if (file === undefined) {
    throw new CliError(
      `no down script for migration ${sequence} under ${MIGRATIONS_DIR}/down`,
    );
  }
  const migration = readdirSync(join(root, MIGRATIONS_DIR)).find(
    (name) => name.startsWith(`${sequence}_`) && name.endsWith(".sql"),
  );
  if (migration === undefined) {
    throw new CliError(`no migration ${sequence} under ${MIGRATIONS_DIR}`);
  }
  return { file: join(MIGRATIONS_DIR, "down", file), migration };
}

export async function dbMigrate(args: ParsedArgs, deps: DbDeps): Promise<number> {
  const run = deps.wrangler ?? defaultWrangler;
  const target = targetArgs(args);
  const down = optionString(args, "down");
  if (down !== undefined) {
    const { file, migration } = downScriptFor(deps.config.root, down);
    run(
      ["d1", "execute", "DB", ...target, "--file", file, "-c", "apps/web/wrangler.jsonc"],
      deps.config.root,
    );
    run(
      [
        "d1",
        "execute",
        "DB",
        ...target,
        "--command",
        `DELETE FROM d1_migrations WHERE name = '${migration}'`,
        "-c",
        "apps/web/wrangler.jsonc",
      ],
      deps.config.root,
    );
    deps.out.log(`rolled back ${migration} with ${file}`);
    return 0;
  }
  run(
    ["d1", "migrations", "apply", "DB", ...target, "-c", "apps/web/wrangler.jsonc"],
    deps.config.root,
  );
  deps.out.log(`migrations applied (${target.join(" ")})`);
  return 0;
}

function defaultWrangler(args: string[], cwd: string): void {
  execSync(`bunx wrangler ${args.map((arg) => JSON.stringify(arg)).join(" ")}`, {
    cwd,
    stdio: "inherit",
  });
}
