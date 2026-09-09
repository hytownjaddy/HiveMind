import {
  workOrderStatusSchema,
  workOrderTargetSchema,
  workOrderTemplateSchema,
} from "@hivemind/schema";
import { z } from "zod";

import { json, readJson, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

const createRequestSchema = z.strictObject({
  template: workOrderTemplateSchema,
  target: workOrderTargetSchema,
  instructions: z.string().max(10_000),
  title: z.string().min(1).max(200).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  labels: z.array(z.string().min(1)).optional(),
  dependencies: z.array(z.string().min(1)).optional(),
  effort: z.enum(["xs", "s", "m", "l", "xl"]).optional(),
});

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { learner: true }, async () => {
    const statusRaw = new URL(request.url).searchParams.get("status");
    const status =
      statusRaw === null ? undefined : workOrderStatusSchema.safeParse(statusRaw).data;
    const { workOrders } = await services();
    return json({
      orders: await workOrders.list(status),
      counts: await workOrders.counts(),
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withAuth(request, { learner: true }, async (principal) => {
    const body = await readJson(request, (value) => createRequestSchema.parse(value));
    if (!body.ok) {
      return body.response;
    }
    const { workOrders, content } = await services();
    const targetPath =
      body.value.target.kind === "lesson"
        ? (await content.lesson(body.value.target.lesson_id, { authorView: true }))
            ?.lesson.source_path
        : undefined;
    const order = await workOrders.create({
      ...body.value,
      requested_by: principal.kind === "learner" ? principal.email : principal.commonName,
      targetPath,
    });
    return json({ order }, 201);
  });
}
