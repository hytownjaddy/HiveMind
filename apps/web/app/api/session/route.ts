import {
  GUEST_SESSION_COOKIE,
  GUEST_SESSION_TTL_MS,
  isUsableSecret,
  issueGuestSession,
  verifyGuestSession,
} from "@hivemind/protocol";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Issue (or refresh) the signed guest cookie. Real accounts will layer on top
 * of this identity later; the realtime Worker only ever sees the guest id.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const { env } = await getCloudflareContext({ async: true });
  const secret = env.GUEST_SESSION_SECRET;
  if (!isUsableSecret(secret)) {
    return NextResponse.json({ error: "session-unavailable" }, { status: 503 });
  }
  const currentToken = request.cookies.get(GUEST_SESSION_COOKIE)?.value;
  const currentSession =
    currentToken === undefined ? null : await verifyGuestSession(currentToken, secret);
  const issued = await issueGuestSession(secret, Date.now(), currentSession?.guestId);
  const response = NextResponse.json({
    authenticated: true,
    expiresAt: issued.session.expiresAt,
  });
  response.cookies.set(GUEST_SESSION_COOKIE, issued.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_SESSION_TTL_MS / 1000,
  });
  return response;
}
