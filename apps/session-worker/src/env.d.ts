/**
 * Bindings declared in wrangler.jsonc plus secrets set with `wrangler secret put`.
 * Keep in sync by hand, or regenerate a full runtime file with `bun run cf-typegen`.
 */
interface Env {
  LAB_SESSIONS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
  LAB_PROVIDER: string;
  GUEST_SESSION_SECRET: string;
}
