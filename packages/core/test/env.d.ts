import type { D1Migration } from "@cloudflare/vitest-pool-workers";

/**
 * Bindings of test/wrangler.jsonc plus the fixtures injected by vitest.config.ts.
 * `cloudflare:test` types `env` as `Cloudflare.Env`, so both shapes are declared.
 */
interface TestBindings {
  DB: D1Database;
  EXPORTS: R2Bucket;
  TEST_MIGRATIONS: D1Migration[];
  TEST_DOWN_0002: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
  interface Env extends TestBindings {}
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
    interface Env extends TestBindings {}
  }
}

export {};
