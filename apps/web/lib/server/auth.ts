import {
  authenticate,
  createAccessVerifier,
  LearnerRepository,
  parseJwks,
  parseServiceTokenScopes,
  requireLearner,
  systemClock,
  type AccessVerifier,
  type AuthResult,
  type Principal,
} from "@hivemind/core";
import { headers } from "next/headers";

import { cloudflareEnv, environmentOf } from "./env";

/*
 * Cloudflare Access → learner_id (D-033). Route handlers call
 * `authenticateRequest(request)`; server components call `currentPrincipal()`.
 * Both are thin: the rule lives in packages/core. Access itself keeps
 * anonymous browsers out at the edge; this layer rejects missing or invalid
 * tokens that reach the Worker any other way.
 */

let verifier: AccessVerifier | null = null;
let verifierKey = "";

function verifierFor(env: CloudflareEnv): AccessVerifier {
  const key = `${env.ACCESS_TEAM_DOMAIN}|${env.ACCESS_AUD}|${env.ACCESS_JWKS ?? ""}`;
  if (verifier === null || verifierKey !== key) {
    verifier = createAccessVerifier({
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      jwks: parseJwks(env.ACCESS_JWKS),
    });
    verifierKey = key;
  }
  return verifier;
}

export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const env = await cloudflareEnv();
  return authenticate(request, {
    verifier: verifierFor(env),
    learners: new LearnerRepository(env.DB, systemClock),
    serviceScopes: parseServiceTokenScopes(env.SERVICE_TOKEN_SCOPES),
    clock: systemClock,
    environment: environmentOf(env),
    devBypassEmail: env.ACCESS_DEV_BYPASS_EMAIL,
  });
}

/** The signed-in learner for a server component, or null when the request is not a learner. */
export async function currentPrincipal(): Promise<Extract<
  Principal,
  { kind: "learner" }
> | null> {
  const incoming = await headers();
  const request = new Request("https://hivemind.internal/", { headers: incoming });
  const result = requireLearner(await authenticateRequest(request));
  return result.ok && result.principal.kind === "learner" ? result.principal : null;
}
