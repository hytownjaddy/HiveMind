import type { Sandbox } from "@cloudflare/sandbox";

declare global {
  /**
   * Bindings declared in wrangler.jsonc plus secrets set with `wrangler secret put`.
   * Keep in sync by hand, or regenerate a full runtime file with `bun run cf-typegen`.
   */
  interface Env {
    LAB_SESSIONS: DurableObjectNamespace;
    DB: D1Database;
    /** Self service binding: the loopback agent and health probes reach this Worker through it. */
    SELF: Fetcher;
    /** Recordings and other session artifacts (D-019); optional locally. */
    ARTIFACTS?: R2Bucket;
    /** Cloudflare Sandbox (Class A/C); absent where containers are not configured. */
    Sandbox?: DurableObjectNamespace<Sandbox>;
    ALLOWED_ORIGINS: string;
    /** Cloudflare Access team domain, e.g. https://royal-breeze-2b7c.cloudflareaccess.com (D-033). */
    ACCESS_TEAM_DOMAIN: string;
    /** Access application audience tag. */
    ACCESS_AUD: string;
    /** development | production | test; the dev bypass and the loopback agent only work outside production. */
    HIVEMIND_ENV: "development" | "production" | "test";
    /** "true" when the Sandbox binding may be offered as a provider. */
    SANDBOX_ENABLED?: string;
    /** Sandbox idle sleep (`sleepAfter`), e.g. "20m"; sessions are destroyed explicitly anyway. */
    SANDBOX_SLEEP_AFTER?: string;
    /** "true" registers the in-Worker loopback agent as a lab worker (dev and tests). */
    PROVIDER_LOOPBACK?: string;
    /** Optional pinned JSON Web Key Set; unset in production so rotation is fetched. */
    ACCESS_JWKS?: string;
    /** JSON map of service-token common names to scopes. */
    SERVICE_TOKEN_SCOPES?: string;
    /** Service token this Worker presents to lab workers behind Access (secrets). */
    LAB_WORKER_CLIENT_ID?: string;
    LAB_WORKER_CLIENT_SECRET?: string;
    /** Local development only: act as this email when no Access token is present. */
    ACCESS_DEV_BYPASS_EMAIL?: string;
  }
}

export {};
