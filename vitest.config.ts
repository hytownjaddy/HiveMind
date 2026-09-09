import { defineConfig } from "vitest/config";

// Pure TypeScript unit tests (schema + web helpers). packages/core and the
// session Worker run inside workerd via their own vitest configs.
export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/web/**/*.test.ts"],
    exclude: ["**/node_modules/**", "packages/core/**"],
    passWithNoTests: false,
  },
});
