import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/.open-next/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/dist/**",
      "**/next-env.d.ts",
      "**/worker-configuration*.d.ts",
      "**/cloudflare-env*.d.ts",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    settings: { react: { version: "19.2" } },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Route handlers are thin adapters (D-031, Stage 01 acceptance 7): they may
    // import the service factory and HTTP helpers, contracts, zod, and Next; any
    // other import (components, client libs, packages/core itself and therefore
    // repositories or SQL) is a violation.
    files: ["apps/web/app/api/**/route.ts", "apps/session-worker/src/index.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex:
                "^(?!(@hivemind/schema|@/lib/server/(http|services|views)|zod|next/server|\\./gateway/[a-z-]+|\\./lab-session)$).*",
              message:
                "Route handlers and the gateway only call packages/core services through the server helpers (D-031).",
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
