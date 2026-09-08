/// <reference types="@cloudflare/workers-types" />

/**
 * Bindings from wrangler.jsonc plus secrets set with `wrangler secret put`.
 * `@opennextjs/cloudflare` returns this shape from `getCloudflareContext()`.
 * Regenerate a full runtime file with `bun run cf-typegen` if you prefer.
 */
interface CloudflareEnv {
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Fetcher;
  REALTIME: Fetcher;
  DB: D1Database;
  NEXTJS_ENV: string;
  GUEST_SESSION_SECRET: string;
}
