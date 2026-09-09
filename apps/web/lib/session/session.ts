import {
  labSessionSummarySchema,
  type CreateLabSessionRequest,
  type LabSessionSummary,
} from "@hivemind/schema";

import { sessionHttpOrigin } from "./origin";

export class SessionError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

/** Ensure a guest session cookie exists before any session traffic. */
export async function ensureGuestSession(fetchImpl: typeof fetch = fetch): Promise<void> {
  const response = await fetchImpl("/api/session", { method: "POST" });
  if (!response.ok) {
    throw new SessionError("session-unavailable", response.status);
  }
}

async function sessionFetch(
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return fetchImpl(`${sessionHttpOrigin()}${path}`, { ...init, credentials: "include" });
}

async function parseSummary(response: Response): Promise<LabSessionSummary> {
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
  return labSessionSummarySchema.parse(await response.json());
}

export async function createLabSession(
  request: CreateLabSessionRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<LabSessionSummary> {
  const response = await sessionFetch(
    "/session/labs",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    },
    fetchImpl,
  );
  return parseSummary(response);
}

export async function fetchLabSession(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LabSessionSummary> {
  const response = await sessionFetch(
    `/session/labs/${encodeURIComponent(sessionId)}`,
    { method: "GET" },
    fetchImpl,
  );
  return parseSummary(response);
}

export async function destroyLabSession(
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LabSessionSummary> {
  const response = await sessionFetch(
    `/session/labs/${encodeURIComponent(sessionId)}/destroy`,
    { method: "POST" },
    fetchImpl,
  );
  return parseSummary(response);
}
