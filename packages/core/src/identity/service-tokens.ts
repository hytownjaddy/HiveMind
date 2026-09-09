import { z } from "zod";

/*
 * Service-token scopes (D-033, Stage 01 security constraints). Access puts a
 * service token's Client ID (`<id>.access`) in the JWT's `common_name` claim;
 * this map, set as a Worker secret (JSON keyed by Client ID), grants each
 * caller the scopes it may use. Unknown callers get nothing.
 */

export const SERVICE_SCOPES = [
  "content:publish",
  "worker:callback",
  "export:read",
] as const;
export const serviceScopeSchema = z.enum(SERVICE_SCOPES);
export type ServiceScope = z.infer<typeof serviceScopeSchema>;

export const serviceTokenScopesSchema = z.record(
  z.string().min(1),
  z.array(serviceScopeSchema),
);
export type ServiceTokenScopes = z.infer<typeof serviceTokenScopesSchema>;

export function parseServiceTokenScopes(raw: string | undefined): ServiceTokenScopes {
  if (raw === undefined || raw.trim().length === 0) {
    return {};
  }
  return serviceTokenScopesSchema.parse(JSON.parse(raw) as unknown);
}

export function scopesFor(
  scopes: ServiceTokenScopes,
  commonName: string,
): readonly ServiceScope[] {
  return scopes[commonName] ?? [];
}
