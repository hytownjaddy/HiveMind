import type { Clock } from "../db/index";
import type { LearnerRecord, LearnerRepository } from "../db/learners";
import { readAccessToken, type AccessPrincipal, type AccessVerifier } from "./access";
import { resolveLearner } from "./learner";
import { scopesFor, type ServiceScope, type ServiceTokenScopes } from "./service-tokens";

export * from "./access";
export * from "./learner";
export * from "./service-tokens";

/*
 * Request authentication used by every route handler and the session gateway.
 * Outcome is a Principal (learner or scoped service) or a typed failure; the
 * adapter maps failures to 401/403 without further logic (D-031).
 */

export type Principal =
  | { readonly kind: "learner"; readonly learner: LearnerRecord; readonly email: string }
  | {
      readonly kind: "service";
      readonly commonName: string;
      readonly scopes: readonly ServiceScope[];
    };

export type AuthFailure =
  | { readonly ok: false; readonly status: 401; readonly error: "unauthenticated" }
  | {
      readonly ok: false;
      readonly status: 403;
      readonly error: "unknown_identity" | "forbidden";
    };

export type AuthResult =
  { readonly ok: true; readonly principal: Principal } | AuthFailure;

export interface AuthContext {
  readonly verifier: AccessVerifier;
  readonly learners: LearnerRepository;
  readonly serviceScopes: ServiceTokenScopes;
  readonly clock: Clock;
  /**
   * Local development only: when set and `environment` is `development`, requests
   * without an Access token act as this email. Ignored everywhere else.
   */
  readonly devBypassEmail?: string | undefined;
  readonly environment: "development" | "production" | "test";
}

export async function authenticate(
  request: Request,
  context: AuthContext,
): Promise<AuthResult> {
  const token = readAccessToken(request);
  let principal: AccessPrincipal;
  if (token === null) {
    if (context.environment === "development" && context.devBypassEmail !== undefined) {
      principal = {
        kind: "learner",
        email: context.devBypassEmail.toLowerCase(),
        subject: null,
      };
    } else {
      return { ok: false, status: 401, error: "unauthenticated" };
    }
  } else {
    const verified = await context.verifier.verify(token);
    if (typeof verified === "string") {
      return { ok: false, status: 401, error: "unauthenticated" };
    }
    principal = verified;
  }
  return principalToResult(principal, context);
}

async function principalToResult(
  principal: AccessPrincipal,
  context: AuthContext,
): Promise<AuthResult> {
  if (principal.kind === "service") {
    return {
      ok: true,
      principal: {
        kind: "service",
        commonName: principal.commonName,
        scopes: scopesFor(context.serviceScopes, principal.commonName),
      },
    };
  }
  const resolved = await resolveLearner(context.learners, principal);
  if (!resolved.ok) {
    return { ok: false, status: 403, error: "unknown_identity" };
  }
  return {
    ok: true,
    principal: { kind: "learner", learner: resolved.learner, email: principal.email },
  };
}

export function requireLearner(result: AuthResult): AuthResult {
  if (result.ok && result.principal.kind !== "learner") {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return result;
}

export function requireScope(result: AuthResult, scope: ServiceScope): AuthResult {
  if (!result.ok) {
    return result;
  }
  if (result.principal.kind === "learner") {
    // A signed-in learner may do anything a scoped service may do (single operator, D-001).
    return result;
  }
  return result.principal.scopes.includes(scope)
    ? result
    : { ok: false, status: 403, error: "forbidden" };
}
