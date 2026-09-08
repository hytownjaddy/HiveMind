/**
 * Where the browser reaches the realtime Worker.
 *
 * Production: same origin; the web Worker proxies /realtime/* over a service
 * binding. Development: `next dev` cannot proxy WebSockets, so the browser
 * talks to `wrangler dev` directly on port 8787. Cookies are shared across
 * ports on the same host, and the Worker allow-lists the dev origins.
 */
const DEV_REALTIME_PORT = "8787";

export function realtimeHttpOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_ORIGIN;
  if (configured !== undefined && configured !== "") {
    return configured.replace(/\/$/u, "");
  }
  if (typeof window === "undefined") {
    return "";
  }
  if (process.env.NODE_ENV === "development") {
    return `${window.location.protocol}//${window.location.hostname}:${DEV_REALTIME_PORT}`;
  }
  return window.location.origin;
}

export function realtimeSocketUrl(path: string): string {
  const http = realtimeHttpOrigin();
  return `${http.replace(/^http/u, "ws")}${path}`;
}
