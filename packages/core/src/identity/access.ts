import {
  createLocalJWKSet,
  createRemoteJWKSet,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

/*
 * Cloudflare Access identity (D-033). Access validates Google login at the
 * edge and forwards a signed JWT in `Cf-Access-Jwt-Assertion` (also the
 * `CF_Authorization` cookie). The Worker verifies it against the team's JWKS
 * (rotation handled by jose's remote key set) and the application AUD tag.
 * Service tokens arrive the same way with a `common_name` claim and no email.
 */

export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
export const ACCESS_JWT_COOKIE = "CF_Authorization";

export interface AccessConfig {
  /** Team domain, e.g. `https://<team>.cloudflareaccess.com`. */
  readonly teamDomain: string;
  /** Application audience (AUD) tag from the Access application. */
  readonly audience: string;
  /**
   * Pinned key set. When set, tokens verify against these keys and nothing is
   * fetched; leave unset in production so rotation is picked up from the team
   * JWKS endpoint. Used by tests and air-gapped drills.
   */
  readonly jwks?: JSONWebKeySet | undefined;
}

export type AccessPrincipal =
  | { readonly kind: "learner"; readonly email: string; readonly subject: string | null }
  | {
      readonly kind: "service";
      readonly commonName: string;
      readonly subject: string | null;
    };

export type AccessFailure = "missing" | "invalid" | "malformed_claims";

export interface AccessVerifier {
  verify(token: string): Promise<AccessPrincipal | AccessFailure>;
}

export function parseJwks(raw: string | undefined): JSONWebKeySet | undefined {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }
  return JSON.parse(raw) as JSONWebKeySet;
}

export function jwksUrl(teamDomain: string): URL {
  return new URL("/cdn-cgi/access/certs", teamDomain);
}

/** Read the Access token from the header first, then the cookie. */
export function readAccessToken(request: Request): string | null {
  const header = request.headers.get(ACCESS_JWT_HEADER);
  if (header !== null && header.length > 0) {
    return header;
  }
  const cookie = request.headers.get("cookie");
  if (cookie === null) {
    return null;
  }
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ACCESS_JWT_COOKIE) {
      return rest.join("=");
    }
  }
  return null;
}

export function principalFromClaims(
  claims: JWTPayload,
): AccessPrincipal | "malformed_claims" {
  const subject =
    typeof claims.sub === "string" && claims.sub.length > 0 ? claims.sub : null;
  const email = claims["email"];
  if (typeof email === "string" && email.length > 0) {
    return { kind: "learner", email: email.toLowerCase(), subject };
  }
  const commonName = claims["common_name"];
  if (typeof commonName === "string" && commonName.length > 0) {
    return { kind: "service", commonName, subject };
  }
  return "malformed_claims";
}

/**
 * Verifier backed by the team's remote JWKS. `getKey` can be injected for
 * tests; production uses `createRemoteJWKSet`, which caches and re-fetches on
 * unknown key ids so key rotation needs no restart.
 */
export function createAccessVerifier(
  config: AccessConfig,
  getKey?: JWTVerifyGetKey,
): AccessVerifier {
  const keys =
    getKey ??
    (config.jwks !== undefined
      ? createLocalJWKSet(config.jwks)
      : createRemoteJWKSet(jwksUrl(config.teamDomain)));
  return {
    async verify(token) {
      if (token.length === 0) {
        return "missing";
      }
      try {
        const { payload } = await jwtVerify(token, keys, {
          issuer: config.teamDomain,
          audience: config.audience,
          algorithms: ["RS256"],
        });
        return principalFromClaims(payload);
      } catch {
        return "invalid";
      }
    },
  };
}
