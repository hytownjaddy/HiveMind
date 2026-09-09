import {
  GUEST_SESSION_COOKIE,
  isUsableSecret,
  readCookie,
  verifyGuestSession,
  type GuestSession,
} from "@hivemind/schema";

/** Resolve the guest identity from the signed cookie, or null when absent/invalid. */
export async function authenticateGuest(
  request: Request,
  secret: string,
): Promise<GuestSession | null> {
  if (!isUsableSecret(secret)) {
    return null;
  }
  const token = readCookie(request.headers.get("cookie"), GUEST_SESSION_COOKIE);
  return token === null ? null : verifyGuestSession(token, secret);
}
