import { json, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Infrastructure console data (companion 18): workers, sessions, runtimes, events, Cloudflare. */
export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { learner: true }, async () => {
    const { infrastructure } = await services();
    return json(await infrastructure.overview());
  });
}
