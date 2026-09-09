import { json, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";
import { viewFrom } from "@/lib/server/views";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ courseId: string; version: string }> },
): Promise<Response> {
  return withAuth(request, { learner: true }, async () => {
    const { courseId, version } = await context.params;
    const { content } = await services();
    const tree = await content.courseTree(
      courseId,
      viewFrom(request),
      version === "latest" ? undefined : version,
    );
    return tree === null
      ? json({ error: "not_found", course_id: courseId, version }, 404)
      : json(tree);
  });
}
