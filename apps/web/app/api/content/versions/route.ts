import { contentBundleSchema } from "@hivemind/schema";
import { z } from "zod";

import { json, readJson, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

const publishRequestSchema = z.strictObject({
  bundle: contentBundleSchema,
  note: z.string().max(500).optional(),
});

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { learner: true }, async () => {
    const { content } = await services();
    return json({ versions: await content.versions() });
  });
}

/** Service-token publish from `hivemind content publish` (D-034); creates an immutable version. */
export async function POST(request: Request): Promise<Response> {
  return withAuth(request, { scope: "content:publish" }, async (principal) => {
    const body = await readJson(request, (value) => publishRequestSchema.parse(value));
    if (!body.ok) {
      return body.response;
    }
    const { content } = await services();
    const publishedBy =
      principal.kind === "learner" ? principal.email : principal.commonName;
    const result = await content.publish(body.value.bundle, publishedBy, body.value.note);
    return json(result, result.reused ? 200 : 201);
  });
}
