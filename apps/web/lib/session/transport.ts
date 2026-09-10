import {
  sessionSummarySchema,
  type CreateSessionRequest,
  type SessionSummary,
} from "@hivemind/schema";

import { sessionHttpOrigin } from "./origin";

/*
 * Browser calls to the session Worker (same origin in production; the web
 * Worker proxies /session/* and Access supplies the identity). Stage 04
 * mounts the Lab Workspace on top of this transport v2.
 */

export class SessionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

async function sessionFetch(
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return fetchImpl(`${sessionHttpOrigin()}${path}`, { ...init, credentials: "include" });
}

async function parseSummary(response: Response): Promise<SessionSummary> {
  if (!response.ok) {
    let code = `http-${String(response.status)}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string") {
        code = body.error;
      }
    } catch {
      // Non-JSON error body.
    }
    throw new SessionError(code, response.status);
  }
  return sessionSummarySchema.parse(await response.json());
}

export async function createLabSession(
  request: CreateSessionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionSummary> {
  return parseSummary(
    await sessionFetch(
      "/session/labs",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      },
      fetchImpl,
    ),
  );
}

export async function fetchLabSession(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionSummary> {
  return parseSummary(
    await sessionFetch(
      `/session/labs/${encodeURIComponent(sessionId)}`,
      { method: "GET" },
      fetchImpl,
    ),
  );
}

export async function destroyLabSession(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionSummary> {
  return parseSummary(
    await sessionFetch(
      `/session/labs/${encodeURIComponent(sessionId)}/destroy`,
      { method: "POST" },
      fetchImpl,
    ),
  );
}
