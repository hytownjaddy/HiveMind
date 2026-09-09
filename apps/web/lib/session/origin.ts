/**
 * Where the browser reaches the session Worker.
 *
 * Production: same origin; the web Worker proxies /session/* over a service
 * binding. Development: `next dev` cannot proxy WebSockets, so the browser
 * talks to `wrangler dev` directly on port 8787. Cookies are shared across
 * ports on the same host, and the Worker allow-lists the dev origins.
 */
const DEV_SESSION_PORT = "8787";

export function sessionHttpOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SESSION_ORIGIN;
  if (configured !== undefined && configured !== "") {
    return configured.replace(/\/$/u, "");
  }
  if (typeof window === "undefined") {
    return "";
  }
  if (process.env.NODE_ENV === "development") {
    return `${window.location.protocol}//${window.location.hostname}:${DEV_SESSION_PORT}`;
  }
  return window.location.origin;
}

export function sessionSocketUrl(path: string): string {
  const http = sessionHttpOrigin();
  return `${http.replace(/^http/u, "ws")}${path}`;
}
