import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Bindings and vars from wrangler.jsonc; works in `next dev` through miniflare. */
export async function cloudflareEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

export function environmentOf(env: CloudflareEnv): "development" | "production" | "test" {
  return env.HIVEMIND_ENV === "production"
    ? "production"
    : env.HIVEMIND_ENV === "test"
      ? "test"
      : "development";
}

export const APP_VERSION = "0.1.0";
