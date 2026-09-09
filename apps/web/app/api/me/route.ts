import { json, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { learner: true }, async (principal) => {
    if (principal.kind !== "learner") {
      return json({ error: "forbidden" }, 403);
    }
    const { learner } = await services();
    const me = await learner.me(principal.learner.id);
    return me === null ? json({ error: "unknown_identity" }, 403) : json(me);
  });
}
