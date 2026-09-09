import { json, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";
import { versionFrom, viewFrom } from "@/lib/server/views";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { learner: true }, async () => {
    const { content } = await services();
    return json(await content.courses(viewFrom(request), versionFrom(request)));
  });
}
