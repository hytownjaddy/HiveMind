import type { ContentBundle } from "@hivemind/schema";

/*
 * `hivemind content diff`: what a compiled bundle changes relative to the
 * latest published version. A lesson whose body changed without a version
 * bump is an error (invariant 6): the publish would silently rewrite what a
 * learner already read.
 */

export interface LessonSummary {
  readonly id: string;
  readonly version: string;
  readonly body_hash: string;
  readonly qa_state: string;
}

export interface BundleSummary {
  readonly content_version_id: string | null;
  readonly courses: readonly { readonly id: string; readonly version: string }[];
  readonly lessons: readonly LessonSummary[];
}

export interface BundleDiff {
  readonly identical: boolean;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly qa_state: string;
  }[];
  readonly unbumped: readonly string[];
  readonly courses: readonly {
    readonly id: string;
    readonly from: string | null;
    readonly to: string;
  }[];
}

export function summarizeBundle(
  bundle: ContentBundle,
  contentVersionId: string | null,
): BundleSummary {
  return {
    content_version_id: contentVersionId,
    courses: bundle.courses.map((course) => ({ id: course.id, version: course.version })),
    lessons: bundle.lessons.map((lesson) => ({
      id: lesson.id,
      version: lesson.version,
      body_hash: lesson.body_hash,
      qa_state: lesson.qa_state,
    })),
  };
}

export function diffBundles(
  previous: BundleSummary | null,
  next: BundleSummary,
): BundleDiff {
  const before = new Map((previous?.lessons ?? []).map((lesson) => [lesson.id, lesson]));
  const after = new Map(next.lessons.map((lesson) => [lesson.id, lesson]));
  const added = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removed = [...before.keys()].filter((id) => !after.has(id)).sort();
  const changed: BundleDiff["changed"][number][] = [];
  const unbumped: string[] = [];
  for (const [id, lesson] of after) {
    const old = before.get(id);
    if (old === undefined) {
      continue;
    }
    if (old.body_hash !== lesson.body_hash && old.version === lesson.version) {
      unbumped.push(id);
    } else if (
      old.version !== lesson.version ||
      old.body_hash !== lesson.body_hash ||
      old.qa_state !== lesson.qa_state
    ) {
      changed.push({
        id,
        from: old.version,
        to: lesson.version,
        qa_state: lesson.qa_state,
      });
    }
  }
  const previousCourses = new Map(
    (previous?.courses ?? []).map((course) => [course.id, course.version]),
  );
  const courses = next.courses
    .filter((course) => previousCourses.get(course.id) !== course.version)
    .map((course) => ({
      id: course.id,
      from: previousCourses.get(course.id) ?? null,
      to: course.version,
    }));
  return {
    identical:
      added.length === 0 &&
      removed.length === 0 &&
      changed.length === 0 &&
      unbumped.length === 0 &&
      courses.length === 0,
    added,
    removed,
    changed,
    unbumped: unbumped.sort(),
    courses,
  };
}

export function formatDiff(diff: BundleDiff): string {
  if (diff.identical) {
    return "no content changes";
  }
  const lines: string[] = [];
  for (const course of diff.courses) {
    lines.push(`course ${course.id}: ${course.from ?? "(new)"} → ${course.to}`);
  }
  for (const id of diff.added) {
    lines.push(`+ ${id}`);
  }
  for (const id of diff.removed) {
    lines.push(`- ${id}`);
  }
  for (const change of diff.changed) {
    lines.push(`~ ${change.id}: ${change.from} → ${change.to} (${change.qa_state})`);
  }
  for (const id of diff.unbumped) {
    lines.push(`! ${id}: body changed without a version bump`);
  }
  return lines.join("\n");
}
