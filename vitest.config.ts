import { defineConfig } from "vitest/config";

// Pure TypeScript unit tests (protocol + web helpers). Worker/Durable Object
// tests run inside workerd via apps/session-worker/vitest.config.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/web/**/*.test.ts"],
    passWithNoTests: false,
  },
});
