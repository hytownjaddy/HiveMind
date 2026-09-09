/// <reference types="@cloudflare/workers-types" />

/**
 * Bindings from wrangler.jsonc plus secrets set with `wrangler secret put`.
 * `@opennextjs/cloudflare` returns this shape from `getCloudflareContext()`.
 * Regenerate a full runtime file with `bun run cf-typegen` if you prefer.
 */
interface CloudflareEnv {
  ASSETS: Fetcher;
  WORKER_SELF_REFERENCE: Fetcher;
  SESSION: Fetcher;
  DB: D1Database;
  /** R2 bucket holding nightly D1 exports and archives (D-020); optional locally. */
  EXPORTS?: R2Bucket;
  NEXTJS_ENV: string;
  /** development | production | test (D-033 dev bypass only in development). */
  HIVEMIND_ENV: string;
  /** Cloudflare Access team domain, e.g. https://royal-breeze-2b7c.cloudflareaccess.com. */
  ACCESS_TEAM_DOMAIN: string;
  /** Access application audience tag. */
  ACCESS_AUD: string;
  /** Optional pinned JSON Web Key Set; unset in production so rotation is fetched. */
  ACCESS_JWKS?: string;
  /** JSON map of service-token common names to scopes. */
  SERVICE_TOKEN_SCOPES?: string;
  /** Local development only: act as this email when no Access token is present. */
  ACCESS_DEV_BYPASS_EMAIL?: string;
}
