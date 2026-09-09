import { generateKeyPairSync } from "node:crypto";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Runs the Worker + Durable Object inside workerd so SQLite storage,
// hibernatable WebSockets, and alarms behave exactly as in production. The
// shared D1 schema is applied from apps/web/migrations for identity mapping,
// and a throwaway RSA key pair stands in for the Access team keys: the public
// half is pinned through ACCESS_JWKS, the private half signs test tokens.
export default defineConfig(async () => {
  const migrations = await readD1Migrations("../web/migrations");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            ALLOWED_ORIGINS: "http://localhost:3000",
            LAB_PROVIDER: "echo",
            ACCESS_TEAM_DOMAIN: "https://hivemind-test.cloudflareaccess.com",
            ACCESS_AUD: "test-aud",
            ACCESS_JWKS: JSON.stringify({ keys: [jwk] }),
            HIVEMIND_ENV: "test",
            TEST_MIGRATIONS: migrations,
            TEST_ACCESS_PRIVATE_KEY: privateKey
              .export({ format: "pem", type: "pkcs8" })
              .toString(),
          },
        },
      }),
    ],
    test: {
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
      testTimeout: 15_000,
    },
  };
});
