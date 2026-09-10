import {
  authenticate,
  createAccessVerifier,
  LearnerRepository,
  parseJwks,
  parseServiceTokenScopes,
  requireScope,
  systemClock,
  type AccessVerifier,
  type AuthResult,
} from "@hivemind/core";

/*
 * Access identity for the gateway (D-033). The verifier caches the team JWKS
 * per isolate; every request maps the validated identity to a learner id
 * through the shared D1 database (packages/core owns the rule). A service
 * token with `lab:operate` acts for the single bound learner (Stage 02, the
 * `hivemind lab` CLI); one with `worker:callback` is a lab worker.
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

export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<AuthResult> {
  return authenticate(request, {
    verifier: verifierFor(env),
    learners: new LearnerRepository(env.DB, systemClock),
    serviceScopes: parseServiceTokenScopes(env.SERVICE_TOKEN_SCOPES),
    clock: systemClock,
    environment: env.HIVEMIND_ENV,
    devBypassEmail: env.ACCESS_DEV_BYPASS_EMAIL,
  });
}

export type GatewayAuth =
  | { readonly ok: true; readonly learnerId: string; readonly operator: boolean }
  | { readonly ok: false; readonly status: 401 | 403; readonly error: string };

/** A learner, or a `lab:operate` service token acting for the single bound learner. */
export async function authenticateLearner(
  request: Request,
  env: Env,
  operatorLearner: () => Promise<{ id: string } | null>,
): Promise<GatewayAuth> {
  const result = await authenticateRequest(request, env);
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error };
  }
  if (result.principal.kind === "learner") {
    return { ok: true, learnerId: result.principal.learner.id, operator: false };
  }
  const scoped = requireScope(result, "lab:operate");
  if (!scoped.ok) {
    return { ok: false, status: scoped.status, error: scoped.error };
  }
  const learner = await operatorLearner();
  if (learner === null) {
    return { ok: false, status: 403, error: "no_operator_learner" };
  }
  return { ok: true, learnerId: learner.id, operator: true };
}

export type CallbackAuth =
  | { readonly ok: true; readonly commonName: string }
  | { readonly ok: false; readonly status: 401 | 403; readonly error: string };

/** A lab worker's service token (`worker:callback`); learners are not workers. */
export async function authenticateWorker(
  request: Request,
  env: Env,
): Promise<CallbackAuth> {
  const result = await authenticateRequest(request, env);
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error };
  }
  if (result.principal.kind !== "service") {
    return { ok: false, status: 403, error: "forbidden" };
  }
  const scoped = requireScope(result, "worker:callback");
  if (!scoped.ok) {
    return { ok: false, status: scoped.status, error: scoped.error };
  }
  return { ok: true, commonName: result.principal.commonName };
}
