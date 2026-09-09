import { execSync } from "node:child_process";

/*
 * CLI configuration from the environment (never from content or work orders):
 *   HIVEMIND_API_URL               web app origin (default http://localhost:3000)
 *   HIVEMIND_ACCESS_CLIENT_ID      Access service token id (production)
 *   HIVEMIND_ACCESS_CLIENT_SECRET  Access service token secret (production)
 *   HIVEMIND_ACTOR                 who acts (default: git user.name, else "jacob")
 *   HIVEMIND_ROOT                  repository root (default: git toplevel or cwd)
 */

export interface CliConfig {
  readonly apiUrl: string;
  readonly accessClientId: string | undefined;
  readonly accessClientSecret: string | undefined;
  readonly actor: string;
  readonly root: string;
}

function gitValue(command: string): string | undefined {
  try {
    const value = execSync(command, {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): CliConfig {
  return {
    apiUrl: (env["HIVEMIND_API_URL"] ?? "http://localhost:3000").replace(/\/+$/u, ""),
    accessClientId: env["HIVEMIND_ACCESS_CLIENT_ID"],
    accessClientSecret: env["HIVEMIND_ACCESS_CLIENT_SECRET"],
    actor: env["HIVEMIND_ACTOR"] ?? gitValue("git config user.name") ?? "jacob",
    root: env["HIVEMIND_ROOT"] ?? gitValue("git rev-parse --show-toplevel") ?? cwd,
  };
}

export function gitCommit(root: string): string | undefined {
  try {
    return execSync("git rev-parse --short=12 HEAD", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

export function changedFiles(root: string): string[] {
  try {
    const output = execSync("git status --porcelain", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    });
    return output
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => line.slice(3).trim())
      .sort();
  } catch {
    return [];
  }
}
