import { createLabSessionRequestSchema, labSessionIdSchema } from "@hivemind/protocol";

import {
  isAllowedOrigin,
  normalizeOrigin,
  preflightResponse,
  withCors,
} from "./gateway/cors";
import { consumeGatewayBurst } from "./gateway/rate-limit";
import { authenticateGuest } from "./gateway/session";

export { LabSession } from "./lab-session";

/**
 * Gateway Worker. Authenticates the guest cookie, applies transport limits,
 * and routes to the owning LabSession Durable Object. It never mutates
 * session state itself.
 *
 * Public surface (same-origin via the web Worker in production):
 *   POST /realtime/labs                 create a session
 *   GET  /realtime/labs/:id             session summary (owner only)
 *   POST /realtime/labs/:id/destroy     tear the session down
 *   GET  /realtime/labs/:id/ws          WebSocket upgrade
 *   GET  /realtime/health
 */
const PREFIX = "/realtime";
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

function sessionStub(env: Env, sessionId: string): DurableObjectStub {
  return env.LAB_SESSIONS.get(env.LAB_SESSIONS.idFromName(sessionId));
}

function internal(path: string, guestId: string, init?: RequestInit): Request {
  const url = new URL(`https://lab.internal${path}`);
  url.searchParams.set("guestId", guestId);
  return new Request(url, init);
}

async function createSession(
  request: Request,
  env: Env,
  guestId: string,
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
  const sessionId = crypto.randomUUID();
  return sessionStub(env, sessionId).fetch(
    internal("/internal/create", guestId, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        sessionId,
        guestId,
        capability: parsed.data.capability,
        problemRef: parsed.data.problemRef ?? null,
      }),
    }),
  );
}

function connect(
  request: Request,
  env: Env,
  guestId: string,
  sessionId: string,
): Promise<Response> {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return Promise.resolve(jsonResponse({ error: "upgrade-required" }, 426));
  }
  // Browser credentials stop here; identity crosses into the object explicitly.
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("origin");
  return sessionStub(env, sessionId).fetch(
    internal("/internal/ws", guestId, { headers }),
  );
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === `${PREFIX}/health`) {
    return jsonResponse({ ok: true });
  }

  const isCreate = request.method === "POST" && url.pathname === `${PREFIX}/labs`;
  const summaryMatch = /^\/realtime\/labs\/([^/]+)$/u.exec(url.pathname);
  const destroyMatch = /^\/realtime\/labs\/([^/]+)\/destroy$/u.exec(url.pathname);
  const socketMatch = /^\/realtime\/labs\/([^/]+)\/ws$/u.exec(url.pathname);
  const isSummary = request.method === "GET" && summaryMatch !== null;
  const isDestroy = request.method === "POST" && destroyMatch !== null;
  const isSocket = request.method === "GET" && socketMatch !== null;
  if (!isCreate && !isSummary && !isDestroy && !isSocket) {
    return jsonResponse({ error: "not-found" }, 404);
  }

  const session = await authenticateGuest(request, env.GUEST_SESSION_SECRET);
  if (session === null) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (!consumeGatewayBurst(`${session.guestId}:${request.method}:${url.pathname}`)) {
    return jsonResponse({ error: "rate-limited" }, 429);
  }

  if (isCreate) {
    return createSession(request, env, session.guestId);
  }
  const rawId = (summaryMatch ?? destroyMatch ?? socketMatch)?.[1];
  const sessionId = labSessionIdSchema.safeParse(rawId);
  if (!sessionId.success) {
    return jsonResponse({ error: "not-found" }, 404);
  }
  if (isSummary) {
    return sessionStub(env, sessionId.data).fetch(
      internal("/internal/summary", session.guestId),
    );
  }
  if (isDestroy) {
    return sessionStub(env, sessionId.data).fetch(
      internal("/internal/destroy", session.guestId, { method: "POST" }),
    );
  }
  return connect(request, env, session.guestId, sessionId.data);
}

export default {
  async fetch(request, env): Promise<Response> {
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
