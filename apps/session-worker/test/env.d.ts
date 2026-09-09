import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare global {
  interface Env {
    TEST_MIGRATIONS: D1Migration[];
    TEST_ACCESS_PRIVATE_KEY: string;
  }
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging
    interface Env extends globalThis.Env {}
  }
}

export {};
