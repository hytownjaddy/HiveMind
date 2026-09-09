import { json, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAuth(request, { learner: true }, async () => {
    const { id } = await context.params;
    const { workOrders } = await services();
    const order = await workOrders.get(id);
    return order === null ? json({ error: "not_found", id }, 404) : json({ order });
  });
}
