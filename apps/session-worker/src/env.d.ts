/**
 * Bindings declared in wrangler.jsonc plus secrets set with `wrangler secret put`.
 * Keep in sync by hand, or regenerate a full runtime file with `bun run cf-typegen`.
 */
interface Env {
  LAB_SESSIONS: DurableObjectNamespace;
  DB: D1Database;
  ALLOWED_ORIGINS: string;
  LAB_PROVIDER: string;
  /** Cloudflare Access team domain, e.g. https://hivemindjrr.cloudflareaccess.com (D-033). */
  ACCESS_TEAM_DOMAIN: string;
  /** Access application audience tag. */
  ACCESS_AUD: string;
  /** development | production | test; the dev bypass only works in development. */
  HIVEMIND_ENV: "development" | "production" | "test";
  /** Optional pinned JSON Web Key Set; unset in production so rotation is fetched. */
  ACCESS_JWKS?: string;
  /** JSON map of service-token common names to scopes. */
  SERVICE_TOKEN_SCOPES?: string;
  /** Local development only: act as this email when no Access token is present. */
  ACCESS_DEV_BYPASS_EMAIL?: string;
}
