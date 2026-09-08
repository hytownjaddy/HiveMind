/**
 * Opaque, signed, expiring guest identity shared by the web Worker (which
 * issues the cookie) and the realtime Worker (which verifies it). Web Crypto
 * only, so it runs identically in Node (next dev), workerd, and browsers.
 */

export const GUEST_SESSION_COOKIE = "hivemind_guest";
export const GUEST_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_SECRET_BYTES = 32;

export interface GuestSession {
  readonly guestId: string;
  readonly expiresAt: number;
}

interface GuestSessionPayload {
  readonly version: 1;
  readonly guestId: string;
  readonly expiresAt: number;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function isUsableSecret(secret: unknown): secret is string {
  return (
    typeof secret === "string" &&
    new TextEncoder().encode(secret).byteLength >= MIN_SECRET_BYTES
  );
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  if (!isUsableSecret(secret)) {
    throw new Error(
      `Guest session secret must contain at least ${MIN_SECRET_BYTES} bytes.`,
    );
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signGuestSession(
  session: GuestSession,
  secret: string,
): Promise<string> {
  const payload: GuestSessionPayload = {
    version: 1,
    guestId: session.guestId,
    expiresAt: session.expiresAt,
  };
  const encodedPayload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(secret),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyGuestSession(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<GuestSession | null> {
  const [encodedPayload, encodedSignature, ...extra] = token.split(".");
  if (
    encodedPayload === undefined ||
    encodedSignature === undefined ||
    extra.length > 0
  ) {
    return null;
  }
  const signature = decodeBase64Url(encodedSignature);
  const payloadBytes = decodeBase64Url(encodedPayload);
  if (signature === null || payloadBytes === null) {
    return null;
  }
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await importSigningKey(secret),
      copyBytes(signature),
      new TextEncoder().encode(encodedPayload),
    );
  } catch {
    return null;
  }
  if (!valid) {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(payloadBytes)) as unknown;
  } catch {
    return null;
  }
  if (
    value === null ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("guestId" in value) ||
    typeof value.guestId !== "string" ||
    !("expiresAt" in value) ||
    typeof value.expiresAt !== "number" ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt <= now
  ) {
    return null;
  }
  return { guestId: value.guestId, expiresAt: value.expiresAt };
}

export async function issueGuestSession(
  secret: string,
  now = Date.now(),
  guestId: string = crypto.randomUUID(),
): Promise<{ readonly session: GuestSession; readonly token: string }> {
  const session = { guestId, expiresAt: now + GUEST_SESSION_TTL_MS };
  return { session, token: await signGuestSession(session, secret) };
}

/** Read one cookie value from a raw `Cookie` header. */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (cookieHeader === null) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return null;
}
