import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Runs the Worker + Durable Object inside workerd so SQLite storage,
// hibernatable WebSockets, and alarms behave exactly as in production.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ALLOWED_ORIGINS: "http://localhost:3000",
          LAB_PROVIDER: "echo",
          GUEST_SESSION_SECRET: "test-secret-that-is-at-least-32-bytes-long",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 15_000,
  },
});
