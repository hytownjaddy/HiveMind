import { getCloudflareContext } from "@opennextjs/cloudflare";

/** The D1 binding declared in wrangler.jsonc. Works in `next dev` via miniflare. */
export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured");
  }
  return env.DB;
}
