import { toLearner } from "@hivemind/core";

import { json, withAuth } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { learner: true }, async (principal) =>
    principal.kind === "learner"
      ? json(toLearner(principal.learner))
      : json({ error: "forbidden" }, 403),
  );
}
