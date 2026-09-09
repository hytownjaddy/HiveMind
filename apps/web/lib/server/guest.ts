import {
  GUEST_SESSION_COOKIE,
  isUsableSecret,
  verifyGuestSession,
  type GuestSession,
} from "@hivemind/schema";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";

export async function getGuestSessionSecret(): Promise<string | null> {
  const { env } = await getCloudflareContext({ async: true });
  return isUsableSecret(env.GUEST_SESSION_SECRET) ? env.GUEST_SESSION_SECRET : null;
}

/** The verified guest for the current request, or null when absent/invalid. */
export async function getVerifiedGuest(): Promise<GuestSession | null> {
  const secret = await getGuestSessionSecret();
  if (secret === null) {
    return null;
  }
  const jar = await cookies();
  const token = jar.get(GUEST_SESSION_COOKIE)?.value;
  return token === undefined ? null : verifyGuestSession(token, secret);
}
