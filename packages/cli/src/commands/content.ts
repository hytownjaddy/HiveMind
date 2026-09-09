import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  compileContent,
  diffBundles,
  formatDiff,
  summarizeBundle,
  type CompileResult,
} from "@hivemind/core/compiler";
import { ContentRepository, RecordingDatabase } from "@hivemind/core";
import { parseDocument } from "yaml";

import type { HiveMindApi } from "../api";
import { optionFlag, optionString, type ParsedArgs } from "../args";
import { gitCommit, type CliConfig } from "../config";
import { CliError, type Output } from "../output";

/*
 * hivemind content compile [dir] [--out file]    validate content/ and write the bundle
 * hivemind content diff [dir]                    compare with the latest published version
 * hivemind content publish [dir] [--note text]    compile, refuse unbumped changes, POST the bundle
 * hivemind content publish [dir] --sql-out file   offline: write the publish as SQL for wrangler d1 execute
 * hivemind content approve <lesson-id> --by name [--publish]
 *                                                 record Jacob's approval in metadata.yaml (invariant 10)
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
  const unapprovedEarly = result.bundle.lessons.filter(
    (lesson) =>
      lesson.qa_state === "published" &&
      (lesson.review.approved_by === undefined ||
        lesson.review.approved_at === undefined),
  );
  if (unapprovedEarly.length > 0) {
    throw new CliError(
      `content publish: published lessons without approval: ${unapprovedEarly.map((lesson) => lesson.id).join(", ")} (invariant 10)`,
    );
  }
  const sqlOut = optionString(args, "sql-out");
  if (sqlOut !== undefined) {
    // Offline publish: the real repository runs against a recording shim and the
    // resulting SQL seeds any database with `wrangler d1 execute --file`.
    const recorder = new RecordingDatabase();
    const version = await new ContentRepository(recorder.asDatabase(), {
      now: deps.now,
    }).publish({
      bundle: result.bundle,
      published_by: deps.config.actor,
      note: optionString(args, "note"),
    });
    mkdirSync(join(sqlOut, ".."), { recursive: true });
    writeFileSync(
      sqlOut,
      `-- hivemind content publish (offline) ${version.id} ${result.bundle.content_hash}\n${recorder.toScript()}`,
    );
    deps.out.log(
      `wrote ${recorder.statements.length} statement(s) for ${version.id} → ${sqlOut}`,
    );
    return 0;
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

/**
 * Approval is a file change so it is reviewable in git: sets review.approved_by,
 * review.approved_at, and qa_state approved (or published with --publish).
 */
export async function contentApprove(
  args: ParsedArgs,
  deps: ContentDeps,
): Promise<number> {
  const lessonId = args.positionals[2];
  const by = optionString(args, "by");
  if (lessonId === undefined || by === undefined || by.trim().length === 0) {
    throw new CliError(
      "usage: hivemind content approve <lesson-id> --by <name> [--publish]",
    );
  }
  const result = await compileContent({
    root: deps.config.root,
    generatedAt: deps.now(),
  });
  const lesson = result.bundle?.lessons.find((candidate) => candidate.id === lessonId);
  if (lesson === undefined || lesson.source_path === undefined) {
    throw new CliError(
      `lesson ${lessonId} not found in a compilable tree${result.diagnostics.hasErrors ? `:\n${result.diagnostics.format()}` : ""}`,
    );
  }
  const path = join(deps.config.root, lesson.source_path, "metadata.yaml");
  const document = parseDocument(readFileSync(path, "utf8"));
  const state = optionFlag(args, "publish") ? "published" : "approved";
  document.set("qa_state", state);
  document.setIn(["review", "approved_by"], by.trim());
  document.setIn(["review", "approved_at"], deps.now());
  writeFileSync(path, document.toString());
  deps.out.log(
    `${lessonId}: qa_state ${state}, approved by ${by.trim()} → ${lesson.source_path}/metadata.yaml`,
  );
  return 0;
}
