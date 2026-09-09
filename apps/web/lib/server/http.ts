import {
  requireLearner,
  requireScope,
  type AuthResult,
  type Principal,
  type ServiceScope,
} from "@hivemind/core";

import { authenticateRequest } from "./auth";

/*
 * Route-handler adapter helpers (D-031, acceptance criterion 7). A handler is
 * `withAuth(...)` around one service call; business rules never live here.
 */

export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

export function failure(result: Extract<AuthResult, { ok: false }>): Response {
  return json({ error: result.error }, result.status);
}

export type Guard = { readonly learner: true } | { readonly scope: ServiceScope };

export async function withAuth(
  request: Request,
  guard: Guard,
  handler: (principal: Principal) => Promise<Response>,
): Promise<Response> {
  const authenticated = await authenticateRequest(request);
  const result =
    "scope" in guard
      ? requireScope(authenticated, guard.scope)
      : requireLearner(authenticated);
  if (!result.ok) {
    return failure(result);
  }
  return handler(result.principal);
}

export async function readJson<T>(
  request: Request,
  parse: (value: unknown) => T,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    return { ok: true, value: parse((await request.json()) as unknown) };
  } catch (error) {
    return {
      ok: false,
      response: json(
        {
          error: "malformed",
          detail: error instanceof Error ? error.message : String(error),
        },
        400,
      ),
    };
  }
}
