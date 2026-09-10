import { defineConfig } from "vitest/config";

// Pure TypeScript unit tests (schema + web helpers). packages/core and the
// session Worker run inside workerd via their own vitest configs.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "packages/schema/**/*.test.ts",
      // packages/core runs inside workerd (its own config); only the node-side
      // content compiler tests belong here.
      "packages/core/src/content/compiler/**/*.test.ts",
      "packages/core/src/labs/compile/**/*.test.ts",
      "packages/cli/**/*.test.ts",
      "apps/web/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
    passWithNoTests: false,
  },
});
