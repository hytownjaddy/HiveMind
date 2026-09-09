import type { Metadata } from "next";
import Link from "next/link";

import { Pane, EmptyRow } from "@/components/ui/Pane";
import { StatusChip } from "@/components/ui/StatusChip";
import { WorkspaceTitle } from "@/components/ui/WorkspaceTitle";
import { services } from "@/lib/server/services";

export const metadata: Metadata = { title: "Courses" };
export const dynamic = "force-dynamic";

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const authorView = view === "author";
  const { content } = await services();
  const { version, courses } = await content.courses({ authorView });
  return (
    <div className="flex h-full flex-col">
      <WorkspaceTitle
        crumbs={[{ label: "HiveMind" }, { label: "Courses" }]}
        title="Courses"
        subtitle={
          version === null
            ? "no content version published"
            : `content version ${version.id} · ${version.counts.lessons} lesson(s)`
        }
        actions={
          <Link
            href={authorView ? "/courses" : "/courses?view=author"}
            className="hm-mono text-[11px] text-accent hover:underline"
          >
            {authorView ? "learner view" : "author view"}
          </Link>
        }
      />
      <div className="p-4">
        <Pane title="Courses" count={courses.length}>
          {courses.length === 0 ? (
            <EmptyRow text="no published content · run hivemind content publish" />
          ) : (
            <table className="hm-table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>title</th>
                  <th>domain</th>
                  <th>version</th>
                  <th>status</th>
                  <th>labs</th>
                  <th className="num">modules</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      <Link
                        href={`/courses/${course.id}${authorView ? "?view=author" : ""}`}
                        className="hm-mono text-accent hover:underline"
                      >
                        {course.id}
                      </Link>
                    </td>
                    <td>{course.title}</td>
                    <td className="hm-mono">{course.domain}</td>
                    <td className="hm-mono">{course.version}</td>
                    <td>
                      <StatusChip value={course.status} />
                    </td>
                    <td className="hm-mono text-muted">
                      {course.uses_labs ? course.capabilities.join(", ") : "none"}
                    </td>
                    <td className="num">{course.module_ids.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Pane>
      </div>
    </div>
  );
}
