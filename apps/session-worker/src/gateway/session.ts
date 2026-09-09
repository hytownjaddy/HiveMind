import {
  authenticate,
  createAccessVerifier,
  LearnerRepository,
  parseJwks,
  parseServiceTokenScopes,
  requireLearner,
  systemClock,
  type AccessVerifier,
} from "@hivemind/core";

/*
 * Access identity for the gateway (D-033). The verifier caches the team JWKS
 * per isolate; every request maps the validated identity to a learner id
 * through the shared D1 database (packages/core owns the rule).
 */

let verifier: AccessVerifier | null = null;
let verifierKey = "";

function verifierFor(env: Env): AccessVerifier {
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

export type GatewayAuth =
  | { readonly ok: true; readonly learnerId: string }
  | { readonly ok: false; readonly status: 401 | 403; readonly error: string };

export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<GatewayAuth> {
  const result = requireLearner(
    await authenticate(request, {
      verifier: verifierFor(env),
      learners: new LearnerRepository(env.DB, systemClock),
      serviceScopes: parseServiceTokenScopes(env.SERVICE_TOKEN_SCOPES),
      clock: systemClock,
      environment: env.HIVEMIND_ENV,
      devBypassEmail: env.ACCESS_DEV_BYPASS_EMAIL,
    }),
  );
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error };
  }
  if (result.principal.kind !== "learner") {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, learnerId: result.principal.learner.id };
}
