import { json, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Marks a draft exported and returns the self-contained file for Claude Code (D-009). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAuth(request, { learner: true }, async (principal) => {
    const { id } = await context.params;
    const { workOrders } = await services();
    const result = await workOrders.export(
      id,
      principal.kind === "learner" ? principal.email : principal.commonName,
    );
    return result.ok ? json(result) : json({ error: result.error, id }, 404);
  });
}
