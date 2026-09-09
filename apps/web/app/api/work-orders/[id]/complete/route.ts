import { changeReportSchema } from "@hivemind/schema";

import { json, readJson, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAuth(request, { learner: true }, async (principal) => {
    const body = await readJson(request, (value) => changeReportSchema.parse(value));
    if (!body.ok) {
      return body.response;
    }
    const { id } = await context.params;
    const { workOrders } = await services();
    const result = await workOrders.complete(
      id,
      body.value,
      principal.kind === "learner" ? principal.email : principal.commonName,
    );
    if (result.ok) {
      return json({ order: result.order });
    }
    return json({ error: result.error, id }, result.error === "not_found" ? 404 : 409);
  });
}
