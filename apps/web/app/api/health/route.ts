import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

/** Unauthenticated liveness for Access-fronted deploys; components report individually. */
export async function GET(): Promise<Response> {
  const { health } = await services();
  const report = await health.report();
  return Response.json(report, { status: report.ok ? 200 : 503 });
}
