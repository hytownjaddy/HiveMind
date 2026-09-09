import { json, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { scope: "content:publish" }, async () => {
    const { content } = await services();
    return json(await content.summary());
  });
}
