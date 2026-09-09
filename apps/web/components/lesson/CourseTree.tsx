import Link from "next/link";

import type { CourseTree as CourseTreeData } from "@hivemind/core";
import type { QaState } from "@hivemind/schema";

const DOT: Record<QaState, string> = {
  draft: "bg-dim",
  technical_review: "bg-info",
  instructional_review: "bg-info",
  execution_test: "bg-info",
  approved: "bg-success",
  published: "bg-success",
  deprecated: "bg-warning",
  archived: "bg-dim",
};

/** Left tree: course › modules › lessons with QA-state dots (04-course-workspace). */
export function CourseTree({
  tree,
  activeLessonId,
  authorView,
}: {
  readonly tree: CourseTreeData;
  readonly activeLessonId: string;
  readonly authorView: boolean;
}) {
  const suffix = authorView ? "?view=author" : "";
  return (
    <nav aria-label="Course tree" className="hm-mono text-[12px]">
      <div className="px-3 py-2 text-muted">{tree.course.title}</div>
      {tree.modules.map(({ module, lessons }) => (
        <div key={module.id} className="mb-1">
          <div className="px-3 py-1 text-dim">
            {String(module.order).padStart(2, "0")} {module.title}
          </div>
          <ul>
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/courses/${tree.course.id}/lessons/${lesson.id}${suffix}`}
                  aria-current={lesson.id === activeLessonId ? "page" : undefined}
                  className={`flex h-7 items-center gap-2 pr-2 pl-6 ${lesson.id === activeLessonId ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
                >
                  <span
                    aria-hidden
                    className={`inline-block h-1.5 w-1.5 rounded-full ${DOT[lesson.qa_state]}`}
                    title={lesson.qa_state}
                  />
                  <span className="truncate">
                    {String(lesson.order).padStart(2, "0")} {lesson.title}
                  </span>
                </Link>
              </li>
            ))}
            {lessons.length === 0 ? (
              <li className="pl-6 text-dim">no visible lessons</li>
            ) : null}
          </ul>
        </div>
      ))}
    </nav>
  );
}
