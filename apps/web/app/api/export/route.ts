import { json, withAuth } from "@/lib/server/http";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Portable archive for `hivemind export` (D-020). */
export async function GET(request: Request): Promise<Response> {
  return withAuth(request, { scope: "export:read" }, async () => {
    const { export: exporter } = await services();
    return json(await exporter.archive());
  });
}
