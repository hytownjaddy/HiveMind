import { readFileSync } from "node:fs";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Services and repositories run inside workerd against a miniflare D1 with the
// real migrations applied, so SQL, triggers, and batches behave as in production.
export default defineConfig(async () => {
  const migrations = await readD1Migrations("../../apps/web/migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./test/wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            TEST_DOWN_0002: readFileSync(
              "../../apps/web/migrations/down/0002_foundation.down.sql",
              "utf8",
            ),
          },
        },
      }),
    ],
    test: {
      include: ["src/**/*.test.ts", "test/**/*.test.ts"],
      exclude: ["**/node_modules/**", "src/content/compiler/**"],
      setupFiles: ["./test/setup.ts"],
      testTimeout: 15_000,
    },
  };
});
