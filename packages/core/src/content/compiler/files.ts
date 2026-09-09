import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { parse as parseYaml } from "yaml";

/** Minimal filesystem view so the compiler is testable against in-memory trees. */
export interface ContentFs {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  readText(path: string): string;
  listDirectories(path: string): string[];
  listFiles(path: string, suffix: string): string[];
}

export function nodeFs(): ContentFs {
  return {
    exists: (path) => {
      try {
        statSync(path);
        return true;
      } catch {
        return false;
      }
    },
    isDirectory: (path) => {
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    readText: (path) => readFileSync(path, "utf8"),
    listDirectories: (path) =>
      readdirSync(path)
        .filter(
          (name) => !name.startsWith(".") && statSync(join(path, name)).isDirectory(),
        )
        .sort(),
    listFiles: (path, suffix) =>
      readdirSync(path)
        .filter((name) => name.endsWith(suffix) && statSync(join(path, name)).isFile())
        .sort(),
  };
}

export function readYaml(fs: ContentFs, path: string): unknown {
  return parseYaml(fs.readText(path));
}

export function repoRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}
