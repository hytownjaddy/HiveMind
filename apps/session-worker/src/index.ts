import {
  createSessionRequestSchema,
  labSessionIdSchema,
  workerEnvelopeSchema,
  type WorkerEnvelope,
} from "@hivemind/schema";

import {
  isAllowedOrigin,
  normalizeOrigin,
  preflightResponse,
  withCors,
} from "./gateway/cors";
import { handleLoopbackJob, handleLoopbackPty } from "./gateway/loopback";
import { consumeGatewayBurst } from "./gateway/rate-limit";
import { ensureLoopbackWorker, services, nowIso } from "./gateway/services";
import { authenticateLearner, authenticateWorker } from "./gateway/session";

export { LabSession } from "./lab-session";
export { Sandbox } from "./gateway/sandbox";

/**
 * Gateway Worker (D-031: a thin adapter). Validates the Cloudflare Access
 * identity, applies transport limits, calls `packages/core` services, and
 * routes to the owning LabSession Durable Object. It never mutates session
 * state itself.
 *
 * Learner surface (same-origin via the web Worker in production):
 *   POST /session/labs                 create a session (archetype + seed)
 *   GET  /session/labs                 recent sessions for the learner
 *   GET  /session/labs/:id             summary (owner only)
 *   GET  /session/labs/:id/events      durable event log
 *   POST /session/labs/:id/destroy     tear the session down
 *   GET  /session/labs/:id/ws          WebSocket upgrade
 *   GET  /session/health
 *
 * Lab worker surface (service token with worker:callback):
 *   POST /session/worker/heartbeat     register / refresh a worker
 *   POST /session/worker/events        job events for a session
 *   POST /session/worker/reconcile     report local sessions; answers with the expected set
 *
 * Loopback agent (dev and tests only): /session/loopback/*
 */
const PREFIX = "/session";
const MAX_HTTP_BODY_BYTES = 256 * 1024;
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

function internal(path: string, learnerId: string | null, init?: RequestInit): Request {
  const url = new URL(`https://lab.internal${path}`);
  if (learnerId !== null) {
    url.searchParams.set("learnerId", learnerId);
  }
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
  const parsed = createSessionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "malformed", detail: parsed.error.message }, 400);
  }
  const { labs, workers } = services(env);
  await ensureLoopbackWorker(env, workers);
  const outcome = await labs.plan(parsed.data);
  if (!outcome.ok) {
    return jsonResponse({ error: outcome.error, detail: outcome.detail }, outcome.status);
  }
  const { plan } = outcome;
  return sessionStub(env, plan.id).fetch(
    internal("/internal/create", learnerId, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        sessionId: plan.id,
        learnerId,
        topology: plan.topology,
        provider: plan.provider,
        providerClass: plan.executionClass,
        workerId: plan.worker?.id ?? null,
        hardTtlMinutes: plan.hardTtlMinutes,
        problemInstanceId: parsed.data.problem_instance_id ?? null,
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
  headers.delete("cf-access-client-id");
  headers.delete("cf-access-client-secret");
  headers.delete("origin");
  return sessionStub(env, sessionId).fetch(
    internal("/internal/ws", learnerId, { headers }),
  );
}

/** Deliver an agent envelope to the object that owns its session. */
async function deliverWorkerEvent(env: Env, envelope: WorkerEnvelope): Promise<Response> {
  const message = envelope.message;
  const sessionId = "lab_session_id" in message ? message.lab_session_id : undefined;
  if (sessionId === undefined) {
    return jsonResponse(
      { error: "no_session", detail: `${message.type} carries no session` },
      400,
    );
  }
  return sessionStub(env, sessionId).fetch(
    internal("/internal/worker-event", null, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(envelope),
    }),
  );
}

async function workerRoute(request: Request, env: Env, path: string): Promise<Response> {
  const auth = await authenticateWorker(request, env);
  if (!auth.ok) {
    return jsonResponse({ error: auth.error }, auth.status);
  }
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return jsonResponse({ error: "malformed" }, 400);
  }
  const parsed = workerEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "malformed", detail: parsed.error.message }, 400);
  }
  const envelope = parsed.data;
  const { workers, labs, sessions } = services(env);
  if (path === "heartbeat") {
    if (envelope.message.type !== "heartbeat") {
      return jsonResponse({ error: "expected_heartbeat" }, 400);
    }
    const worker = await workers.heartbeat(envelope.message);
    return jsonResponse({ worker });
  }
  if (path === "events") {
    return deliverWorkerEvent(env, envelope);
  }
  if (path === "reconcile") {
    if (envelope.message.type !== "event.reconcile") {
      return jsonResponse({ error: "expected_reconcile" }, 400);
    }
    const workerId = envelope.message.worker_id;
    const expected = await labs.expectedOnWorker(workerId);
    const reported = new Set(envelope.message.sessions.map((s) => s.lab_session_id));
    // Sessions the objects expect but the worker no longer has: fail them.
    for (const entry of expected) {
      if (!reported.has(entry.lab_session_id)) {
        await sessionStub(env, entry.lab_session_id).fetch(
          internal("/internal/reconcile-missing", null, { method: "POST" }),
        );
      }
    }
    const stillExpected = (await sessions.listExpectedOnWorker(workerId)).map((s) => ({
      lab_session_id: s.id,
      status: s.status,
    }));
    return jsonResponse(
      workerEnvelopeSchema.parse({
        protocol_version: 1,
        message_id: crypto.randomUUID(),
        correlation_id: envelope.message_id,
        sent_at: nowIso(),
        sender: { kind: "session_worker", id: "hivemind-session" },
        message: {
          type: "reconcile.expected",
          worker_id: workerId,
          sessions: stillExpected,
          at: nowIso(),
        },
      }),
    );
  }
  return jsonResponse({ error: "not-found" }, 404);
}

async function loopbackRoute(
  request: Request,
  env: Env,
  url: URL,
  ctx: ExecutionContext,
): Promise<Response> {
  if (env.PROVIDER_LOOPBACK !== "true" || env.HIVEMIND_ENV === "production") {
    return jsonResponse({ error: "not-found" }, 404);
  }
  if (request.method === "POST" && url.pathname === `${PREFIX}/loopback/jobs`) {
    return handleLoopbackJob(
      request,
      {
        deliver: async (envelope) => {
          await deliverWorkerEvent(env, envelope);
        },
      },
      (promise) => ctx.waitUntil(promise),
    );
  }
  const pty = /^\/session\/loopback\/sessions\/([^/]+)\/nodes\/([^/]+)\/pty$/u.exec(
    url.pathname,
  );
  if (request.method === "GET" && pty !== null) {
    return handleLoopbackPty(
      request,
      decodeURIComponent(pty[1] ?? ""),
      decodeURIComponent(pty[2] ?? ""),
    );
  }
  return jsonResponse({ error: "not-found" }, 404);
}

async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === `${PREFIX}/health`) {
    return jsonResponse({ ok: true });
  }
  if (url.pathname.startsWith(`${PREFIX}/loopback/`)) {
    return loopbackRoute(request, env, url, ctx);
  }
  const workerMatch = /^\/session\/worker\/(heartbeat|events|reconcile)$/u.exec(
    url.pathname,
  );
  if (request.method === "POST" && workerMatch !== null) {
    return workerRoute(request, env, workerMatch[1] ?? "");
  }

  const isCreate = request.method === "POST" && url.pathname === `${PREFIX}/labs`;
  const isList = request.method === "GET" && url.pathname === `${PREFIX}/labs`;
  const summaryMatch = /^\/session\/labs\/([^/]+)$/u.exec(url.pathname);
  const eventsMatch = /^\/session\/labs\/([^/]+)\/events$/u.exec(url.pathname);
  const destroyMatch = /^\/session\/labs\/([^/]+)\/destroy$/u.exec(url.pathname);
  const socketMatch = /^\/session\/labs\/([^/]+)\/ws$/u.exec(url.pathname);
  const isSummary = request.method === "GET" && summaryMatch !== null;
  const isEvents = request.method === "GET" && eventsMatch !== null;
  const isDestroy = request.method === "POST" && destroyMatch !== null;
  const isSocket = request.method === "GET" && socketMatch !== null;
  if (!isCreate && !isList && !isSummary && !isEvents && !isDestroy && !isSocket) {
    return jsonResponse({ error: "not-found" }, 404);
  }

  const { labs, sessions } = services(env);
  const auth = await authenticateLearner(request, env, () => labs.operatorLearner());
  if (!auth.ok) {
    return jsonResponse({ error: auth.error }, auth.status);
  }
  const learnerId = auth.learnerId;
  if (!consumeGatewayBurst(`${learnerId}:${request.method}:${url.pathname}`)) {
    return jsonResponse({ error: "rate_limited" }, 429);
  }

  if (isCreate) {
    return createSession(request, env, learnerId);
  }
  if (isList) {
    return jsonResponse({ sessions: await sessions.listRecent(learnerId, 20) });
  }
  const rawId = (summaryMatch ?? eventsMatch ?? destroyMatch ?? socketMatch)?.[1];
  const sessionId = labSessionIdSchema.safeParse(rawId);
  if (!sessionId.success) {
    return jsonResponse({ error: "not-found" }, 404);
  }
  if (isSummary) {
    return sessionStub(env, sessionId.data).fetch(
      internal("/internal/summary", learnerId),
    );
  }
  if (isEvents) {
    const after = url.searchParams.get("after") ?? "0";
    return sessionStub(env, sessionId.data).fetch(
      internal(`/internal/events?after=${encodeURIComponent(after)}`, learnerId),
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
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    // Liveness and the loopback agent need no origin: the web Worker probes
    // health over the service binding, and the object reaches the loopback
    // agent through the self binding.
    if (url.pathname === `${PREFIX}/health` && request.method === "GET") {
      return jsonResponse({ ok: true });
    }
    if (url.pathname.startsWith(`${PREFIX}/loopback/`)) {
      return loopbackRoute(request, env, url, ctx);
    }
    const origin = normalizeOrigin(request.headers.get("origin"));
    const allowed = origin !== null && isAllowedOrigin(origin, env.ALLOWED_ORIGINS);
    if (request.method === "OPTIONS") {
      return allowed ? preflightResponse(origin) : new Response(null, { status: 403 });
    }
    if (!allowed) {
      return jsonResponse({ error: "invalid-origin" }, 403);
    }
    const response = await route(request, env, ctx);
    return withCors(response, origin);
  },
} satisfies ExportedHandler<Env>;
