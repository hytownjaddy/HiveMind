import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  compileContent,
  diffBundles,
  formatDiff,
  summarizeBundle,
  type CompileResult,
} from "@hivemind/core/compiler";

import type { HiveMindApi } from "../api";
import { optionFlag, optionString, type ParsedArgs } from "../args";
import { gitCommit, type CliConfig } from "../config";
import { CliError, type Output } from "../output";

/*
 * hivemind content compile [dir] [--out file]    validate content/ and write the bundle
 * hivemind content diff [dir]                    compare with the latest published version
 * hivemind content publish [dir] [--note text]    compile, refuse unbumped changes, POST the bundle
 */

export interface ContentDeps {
  readonly config: CliConfig;
  readonly api: HiveMindApi;
  readonly out: Output;
  readonly now: () => string;
}

async function compile(args: ParsedArgs, deps: ContentDeps): Promise<CompileResult> {
  const dir = args.positionals[2];
  const contentDir = dir === undefined ? undefined : join(deps.config.root, dir);
  const result = await compileContent({
    root: deps.config.root,
    contentDir,
    generatedAt: deps.now(),
    gitCommit: gitCommit(deps.config.root),
  });
  const text = result.diagnostics.format();
  if (text.length > 0) {
    deps.out.error(text);
  }
  return result;
}

export async function contentCompile(
  args: ParsedArgs,
  deps: ContentDeps,
): Promise<number> {
  const result = await compile(args, deps);
  if (result.bundle === null) {
    deps.out.error(`content compile: ${result.diagnostics.errors.length} error(s)`);
    return 1;
  }
  const outPath =
    optionString(args, "out") ??
    join(deps.config.root, ".hivemind", "build", "content-bundle.json");
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(result.bundle, null, 2)}\n`);
  const { bundle } = result;
  deps.out.log(
    `content compile: ${bundle.courses.length} course(s), ${bundle.modules.length} module(s), ${bundle.lessons.length} lesson(s), ${bundle.skills.length} skill(s), ${bundle.sources.length} source(s); hash ${bundle.content_hash.slice(0, 12)} → ${outPath}`,
  );
  return 0;
}

export async function contentDiff(args: ParsedArgs, deps: ContentDeps): Promise<number> {
  const result = await compile(args, deps);
  if (result.bundle === null) {
    return 1;
  }
  const previous = await deps.api.contentSummary();
  const diff = diffBundles(
    previous.content_version_id === null ? null : previous,
    summarizeBundle(result.bundle, null),
  );
  deps.out.log(`against ${previous.content_version_id ?? "(nothing published)"}:`);
  deps.out.log(formatDiff(diff));
  return diff.unbumped.length > 0 ? 1 : 0;
}

export async function contentPublish(
  args: ParsedArgs,
  deps: ContentDeps,
): Promise<number> {
  const result = await compile(args, deps);
  if (result.bundle === null) {
    throw new CliError("content publish: fix the compile errors first");
  }
  const previous = await deps.api.contentSummary();
  const diff = diffBundles(
    previous.content_version_id === null ? null : previous,
    summarizeBundle(result.bundle, null),
  );
  if (diff.unbumped.length > 0 && !optionFlag(args, "allow-unbumped")) {
    throw new CliError(
      `content publish: body changed without a version bump: ${diff.unbumped.join(", ")} (invariant 6)`,
    );
  }
  const unapproved = result.bundle.lessons.filter(
    (lesson) =>
      lesson.qa_state === "published" &&
      (lesson.review.approved_by === undefined ||
        lesson.review.approved_at === undefined),
  );
  if (unapproved.length > 0) {
    throw new CliError(
      `content publish: published lessons without approval: ${unapproved.map((lesson) => lesson.id).join(", ")} (invariant 10)`,
    );
  }
  const { version, reused } = await deps.api.publishContent(
    result.bundle,
    optionString(args, "note"),
  );
  deps.out.log(
    `${reused ? "already published as" : "published"} ${version.id} (${version.counts.lessons} lesson(s), hash ${version.content_hash.slice(0, 12)})`,
  );
  deps.out.log(formatDiff(diff));
  return 0;
}
