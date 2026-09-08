/**
 * Origin allow-listing and CORS.
 *
 * In production the web Worker proxies /hives/* over a service binding and
 * stamps a trusted internal origin, so browsers never see these CORS headers.
 * During `next dev` the browser calls this Worker directly on another port, so
 * the allow-listed dev origins get proper credentialed CORS responses.
 */

export function normalizeOrigin(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin: string | null, configured: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (normalized === null) {
    return false;
  }
  return configured
    .split(",")
    .map((entry) => normalizeOrigin(entry.trim()))
    .some((entry) => entry !== null && entry === normalized);
}

export function preflightResponse(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin, {
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
    }),
  });
}

function corsHeaders(origin: string, extra: Record<string, string> = {}): Headers {
  const headers = new Headers(extra);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.append("vary", "origin");
  return headers;
}

/** Attach CORS headers for an allowed origin. WebSocket upgrades pass through untouched. */
export function withCors(response: Response, origin: string): Response {
  if (response.status === 101) {
    return response;
  }
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(origin)) {
    if (key === "vary") {
      headers.append(key, value);
    } else {
      headers.set(key, value);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
