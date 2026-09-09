import { workOrderStatusSchema } from "@hivemind/schema";
import { z } from "zod";

import { json, readJson, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

const transitionRequestSchema = z.strictObject({
  to: workOrderStatusSchema,
  note: z.string().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withAuth(request, { learner: true }, async (principal) => {
    const body = await readJson(request, (value) => transitionRequestSchema.parse(value));
    if (!body.ok) {
      return body.response;
    }
    const { id } = await context.params;
    const { workOrders } = await services();
    const result = await workOrders.transition(
      id,
      body.value.to,
      principal.kind === "learner" ? principal.email : principal.commonName,
      body.value.note,
    );
    if (result.ok) {
      return json({ order: result.order });
    }
    return json(
      {
        error: result.error,
        id,
        ...(result.from === undefined ? {} : { from: result.from }),
      },
      result.error === "not_found" ? 404 : 409,
    );
  });
}
