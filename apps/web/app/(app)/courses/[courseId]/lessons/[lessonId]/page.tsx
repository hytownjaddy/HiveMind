import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseTree } from "@/components/lesson/CourseTree";
import { LessonBody } from "@/components/lesson/LessonBody";
import { LessonKeys } from "@/components/lesson/LessonKeys";
import { RightRail } from "@/components/lesson/RightRail";
import { IdBadge } from "@/components/ui/IdBadge";
import { StatusChip } from "@/components/ui/StatusChip";
import { WorkspaceTitle } from "@/components/ui/WorkspaceTitle";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/*
 * 04-course-workspace.md: tree, lesson, right rail; version and QA badge;
 * `create work order` opens the Work Orders panel with lesson.update context.
 */
export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
  searchParams: Promise<{ view?: string; version?: string }>;
}) {
  const [{ courseId, lessonId }, { view, version }] = await Promise.all([
    params,
    searchParams,
  ]);
  const authorView = view === "author";
  const { content } = await services();
  const [tree, served] = await Promise.all([
    content.courseTree(courseId, { authorView }, version),
    content.lesson(lessonId, { authorView }, version),
  ]);
  if (tree === null || served === null || served.lesson.course_id !== courseId) {
    notFound();
  }
  const { lesson, sources } = served;
  const ordered = tree.modules.flatMap((module) => module.lessons);
  const position = ordered.findIndex((entry) => entry.id === lesson.id);
  const previous = position > 0 ? ordered[position - 1] : undefined;
  const next = position >= 0 ? ordered[position + 1] : undefined;
  const suffix = authorView ? "?view=author" : "";
  const href = (id: string): string => `/courses/${courseId}/lessons/${id}${suffix}`;
  return (
    <div className="flex h-full flex-col">
      <LessonKeys
        previous={previous === undefined ? null : href(previous.id)}
        next={next === undefined ? null : href(next.id)}
      />
      <WorkspaceTitle
        crumbs={[
          { label: "Courses", href: "/courses" },
          { label: tree.course.title, href: `/courses/${courseId}${suffix}` },
          { label: lesson.id },
        ]}
        title={`Lesson ${lesson.order} · ${lesson.title}`}
        subtitle={lesson.summary}
        actions={
          <>
            <IdBadge id={lesson.id} />
            <span className="hm-mono text-[11px] text-muted">
              v{lesson.version} · {served.version.id}
            </span>
            <StatusChip kind="qa" value={lesson.qa_state} />
            <Link
              href={`/work-orders?new=1&template=lesson.update&lesson=${lesson.id}`}
              className="hm-mono rounded-sm border border-border px-2 py-0.5 text-[11px] text-accent hover:bg-panel-2"
            >
              create work order
            </Link>
          </>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_320px]">
        <div className="min-h-0 overflow-y-auto border-r border-border bg-panel">
          <CourseTree tree={tree} activeLessonId={lesson.id} authorView={authorView} />
        </div>
        <div className="min-h-0 overflow-y-auto px-6 py-4">
          <LessonBody lesson={lesson} />
          <div className="hm-mono mt-8 flex justify-between border-t border-border pt-3 text-[12px]">
            {previous !== undefined ? (
              <Link href={href(previous.id)} className="text-accent hover:underline">
                ← {previous.title} <kbd className="text-dim">k</kbd>
              </Link>
            ) : (
              <span />
            )}
            {next !== undefined ? (
              <Link href={href(next.id)} className="text-accent hover:underline">
                <kbd className="text-dim">j</kbd> {next.title} →
              </Link>
            ) : (
              <span className="text-dim">end of module</span>
            )}
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto border-l border-border bg-panel">
          <RightRail lesson={lesson} sources={sources} />
        </div>
      </div>
    </div>
  );
}
