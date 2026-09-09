import { notFound, redirect } from "next/navigation";

import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** A course opens on its first visible lesson. */
export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ courseId }, { view }] = await Promise.all([params, searchParams]);
  const { content } = await services();
  const tree = await content.courseTree(courseId, { authorView: view === "author" });
  if (tree === null) {
    notFound();
  }
  const first = tree.modules.flatMap((module) => module.lessons)[0];
  if (first === undefined) {
    return (
      <div className="hm-mono p-4 text-[12px] text-muted">
        no published lessons in {courseId} · run hivemind content publish
      </div>
    );
  }
  redirect(
    `/courses/${courseId}/lessons/${first.id}${view === "author" ? "?view=author" : ""}`,
  );
}
