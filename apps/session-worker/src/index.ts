import {
  createLabSessionRequestSchema,
  formatLabSessionId,
  labSessionIdSchema,
} from "@hivemind/schema";

import {
  isAllowedOrigin,
  normalizeOrigin,
  preflightResponse,
  withCors,
} from "./gateway/cors";
import { consumeGatewayBurst } from "./gateway/rate-limit";
import { authenticateRequest } from "./gateway/session";

export { LabSession } from "./lab-session";

/**
 * Gateway Worker. Validates the Cloudflare Access identity (D-033), applies
 * transport limits, and routes to the owning LabSession Durable Object. It
 * never mutates session state itself.
 *
 * Public surface (same-origin via the web Worker in production):
 *   POST /session/labs                 create a session
 *   GET  /session/labs/:id             session summary (owner only)
 *   POST /session/labs/:id/destroy     tear the session down
 *   GET  /session/labs/:id/ws          WebSocket upgrade
 *   GET  /session/health
 */
const PREFIX = "/session";
const MAX_HTTP_BODY_BYTES = 8 * 1024;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

async function readJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_HTTP_BODY_BYTES) {
    throw new Error("body-too-large");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_HTTP_BODY_BYTES) {
    throw new Error("body-too-large");
  }
  return JSON.parse(body) as unknown;
}

/** Six-digit sequence for `HM-LAB-nnnnnn` (D-038); Stage 02 allocates from the D1 index. */
function randomSessionSequence(): number {
  return 100_000 + ((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 900_000);
}

function sessionStub(env: Env, sessionId: string): DurableObjectStub {
  return env.LAB_SESSIONS.get(env.LAB_SESSIONS.idFromName(sessionId));
}

function internal(path: string, learnerId: string, init?: RequestInit): Request {
  const url = new URL(`https://lab.internal${path}`);
  url.searchParams.set("learnerId", learnerId);
  return new Request(url, init);
}

async function createSession(
  request: Request,
  env: Env,
  learnerId: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return jsonResponse({ error: "malformed" }, 400);
  }
  const parsed = createLabSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "malformed" }, 400);
  }
  const sessionId = formatLabSessionId(randomSessionSequence());
  return sessionStub(env, sessionId).fetch(
    internal("/internal/create", learnerId, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        sessionId,
        learnerId,
        capability: parsed.data.capability,
        problemRef: parsed.data.problemRef ?? null,
      }),
    }),
  );
}

function connect(
  request: Request,
  env: Env,
  learnerId: string,
  sessionId: string,
): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return Promise.resolve(jsonResponse({ error: "upgrade-required" }, 426));
  }
  // Browser credentials stop here; identity crosses into the object explicitly.
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("cf-access-jwt-assertion");
  headers.delete("origin");
  return sessionStub(env, sessionId).fetch(
    internal("/internal/ws", learnerId, { headers }),
  );
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === `${PREFIX}/health`) {
    return jsonResponse({ ok: true });
  }

  const isCreate = request.method === "POST" && url.pathname === `${PREFIX}/labs`;
  const summaryMatch = /^\/session\/labs\/([^/]+)$/u.exec(url.pathname);
  const destroyMatch = /^\/session\/labs\/([^/]+)\/destroy$/u.exec(url.pathname);
  const socketMatch = /^\/session\/labs\/([^/]+)\/ws$/u.exec(url.pathname);
  const isSummary = request.method === "GET" && summaryMatch !== null;
  const isDestroy = request.method === "POST" && destroyMatch !== null;
  const isSocket = request.method === "GET" && socketMatch !== null;
  if (!isCreate && !isSummary && !isDestroy && !isSocket) {
    return jsonResponse({ error: "not-found" }, 404);
  }

  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return jsonResponse({ error: auth.error }, auth.status);
  }
  const learnerId = auth.learnerId;
  if (!consumeGatewayBurst(`${learnerId}:${request.method}:${url.pathname}`)) {
    return jsonResponse({ error: "rate-limited" }, 429);
  }

  if (isCreate) {
    return createSession(request, env, learnerId);
  }
  const rawId = (summaryMatch ?? destroyMatch ?? socketMatch)?.[1];
  const sessionId = labSessionIdSchema.safeParse(rawId);
  if (!sessionId.success) {
    return jsonResponse({ error: "not-found" }, 404);
  }
  if (isSummary) {
    return sessionStub(env, sessionId.data).fetch(
      internal("/internal/summary", learnerId),
    );
  }
  if (isDestroy) {
    return sessionStub(env, sessionId.data).fetch(
      internal("/internal/destroy", learnerId, { method: "POST" }),
    );
  }
  return connect(request, env, learnerId, sessionId.data);
}

export default {
  async fetch(request, env): Promise<Response> {
    // Liveness needs no identity or origin: the web Worker probes it over the
    // service binding, and dev proxies do not forward Origin.
    if (
      new URL(request.url).pathname === `${PREFIX}/health` &&
      request.method === "GET"
    ) {
      return jsonResponse({ ok: true });
    }
    const origin = normalizeOrigin(request.headers.get("origin"));
    const allowed = origin !== null && isAllowedOrigin(origin, env.ALLOWED_ORIGINS);
    if (request.method === "OPTIONS") {
      return allowed ? preflightResponse(origin) : new Response(null, { status: 403 });
    }
    if (!allowed) {
      return jsonResponse({ error: "invalid-origin" }, 403);
    }
    const response = await route(request, env);
    return withCors(response, origin);
  },
} satisfies ExportedHandler<Env>;
