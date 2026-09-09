import { env } from "cloudflare:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { LearnerRepository } from "../src/db/learners";
import {
  authenticate,
  createAccessVerifier,
  requireLearner,
  requireScope,
  type AuthContext,
} from "../src/identity/index";
import { fixedClock } from "./clock";

const TEAM = "https://hivemindjrr.cloudflareaccess.com";
const AUD = "aud-tag-0123456789abcdef";

let privateKey: CryptoKey;
let publicKey: CryptoKey;
let wrongKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  wrongKey = (await generateKeyPair("RS256")).privateKey;
});

async function token(
  claims: Record<string, unknown>,
  options: { key?: CryptoKey; aud?: string; exp?: string; iss?: string } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.iss ?? TEAM)
    .setAudience(options.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(options.exp ?? "10m")
    .sign(options.key ?? privateKey);
}

function context(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    verifier: createAccessVerifier(
      { teamDomain: TEAM, audience: AUD },
      async () => publicKey,
    ),
    learners: new LearnerRepository(env.DB, fixedClock()),
    serviceScopes: { "hivemind-cli": ["content:publish"] },
    clock: fixedClock(),
    environment: "production",
    ...overrides,
  };
}

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://hivemindjrr.com/api/me", { headers });
}

describe("Access JWT verification", () => {
  it("accepts a valid learner token", async () => {
    const verifier = createAccessVerifier(
      { teamDomain: TEAM, audience: AUD },
      async () => publicKey,
    );
    expect(
      await verifier.verify(await token({ email: "Jacob@Example.com", sub: "sub-1" })),
    ).toEqual({
      kind: "learner",
      email: "jacob@example.com",
      subject: "sub-1",
    });
  });

  it("verifies against a pinned key set when one is configured", async () => {
    const jwk = {
      ...(await exportJWK(publicKey)),
      kid: "test-key",
      alg: "RS256",
      use: "sig",
    };
    const verifier = createAccessVerifier({
      teamDomain: TEAM,
      audience: AUD,
      jwks: { keys: [jwk] },
    });
    expect(await verifier.verify(await token({ email: "a@b.co" }))).toEqual({
      kind: "learner",
      email: "a@b.co",
      subject: null,
    });
    expect(
      await verifier.verify(await token({ email: "a@b.co" }, { key: wrongKey })),
    ).toBe("invalid");
  });

  it("recognises service tokens by common_name", async () => {
    const verifier = createAccessVerifier(
      { teamDomain: TEAM, audience: AUD },
      async () => publicKey,
    );
    expect(await verifier.verify(await token({ common_name: "hivemind-cli" }))).toEqual({
      kind: "service",
      commonName: "hivemind-cli",
      subject: null,
    });
  });

  it("rejects wrong audience, issuer, expiry, signature, and garbage", async () => {
    const verifier = createAccessVerifier(
      { teamDomain: TEAM, audience: AUD },
      async () => publicKey,
    );
    expect(
      await verifier.verify(await token({ email: "a@b.co" }, { aud: "other" })),
    ).toBe("invalid");
    expect(
      await verifier.verify(
        await token({ email: "a@b.co" }, { iss: "https://other.cloudflareaccess.com" }),
      ),
    ).toBe("invalid");
    expect(await verifier.verify(await token({ email: "a@b.co" }, { exp: "-1m" }))).toBe(
      "invalid",
    );
    expect(
      await verifier.verify(await token({ email: "a@b.co" }, { key: wrongKey })),
    ).toBe("invalid");
    expect(await verifier.verify("not.a.jwt")).toBe("invalid");
    expect(await verifier.verify("")).toBe("missing");
    expect(await verifier.verify(await token({}))).toBe("malformed_claims");
  });
});

describe("authenticate", () => {
  it("rejects requests without a token", async () => {
    expect(await authenticate(request(), context())).toEqual({
      ok: false,
      status: 401,
      error: "unauthenticated",
    });
  });

  it("rejects invalid tokens with 401", async () => {
    const result = await authenticate(
      request({
        "cf-access-jwt-assertion": await token({ email: "a@b.co" }, { key: wrongKey }),
      }),
      context(),
    );
    expect(result).toEqual({ ok: false, status: 401, error: "unauthenticated" });
  });

  it("binds the first identity to the seeded learner and then only accepts it", async () => {
    const ctx = context();
    const first = await authenticate(
      request({
        "cf-access-jwt-assertion": await token({ email: "jacob@example.com", sub: "s" }),
      }),
      ctx,
    );
    expect(
      first.ok && first.principal.kind === "learner" && first.principal.learner.id,
    ).toBe("HM-LRN-000001");
    const again = await authenticate(
      request({
        cookie: `CF_Authorization=${await token({ email: "jacob@example.com" })}`,
      }),
      ctx,
    );
    expect(
      again.ok && again.principal.kind === "learner" && again.principal.learner.email,
    ).toBe("jacob@example.com");
    const stranger = await authenticate(
      request({ "cf-access-jwt-assertion": await token({ email: "someone@else.com" }) }),
      ctx,
    );
    expect(stranger).toEqual({ ok: false, status: 403, error: "unknown_identity" });
  });

  it("uses the dev bypass only in development", async () => {
    const dev = await authenticate(
      request(),
      context({ environment: "development", devBypassEmail: "dev@local" }),
    );
    expect(dev.ok && dev.principal.kind === "learner" && dev.principal.email).toBe(
      "dev@local",
    );
    const prod = await authenticate(
      request(),
      context({ environment: "production", devBypassEmail: "dev@local" }),
    );
    expect(prod).toEqual({ ok: false, status: 401, error: "unauthenticated" });
  });

  it("scopes service tokens per caller", async () => {
    const ctx = context();
    const cli = await authenticate(
      request({
        "cf-access-jwt-assertion": await token({ common_name: "hivemind-cli" }),
      }),
      ctx,
    );
    expect(requireScope(cli, "content:publish").ok).toBe(true);
    expect(requireScope(cli, "export:read")).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(requireLearner(cli)).toEqual({ ok: false, status: 403, error: "forbidden" });
    const unknown = await authenticate(
      request({ "cf-access-jwt-assertion": await token({ common_name: "rogue" }) }),
      ctx,
    );
    expect(requireScope(unknown, "content:publish")).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
  });
});
