import { json, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";
import { versionFrom, viewFrom } from "@/lib/server/views";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
): Promise<Response> {
  return withAuth(request, { learner: true }, async () => {
    const { lessonId } = await context.params;
    const { content } = await services();
    const lesson = await content.lesson(
      lessonId,
      viewFrom(request),
      versionFrom(request),
    );
    return lesson === null
      ? json({ error: "not_found", lesson_id: lessonId }, 404)
      : json(lesson);
  });
}
