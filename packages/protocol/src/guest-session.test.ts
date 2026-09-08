import { describe, expect, it } from "vitest";

import {
  GUEST_SESSION_TTL_MS,
  issueGuestSession,
  readCookie,
  verifyGuestSession,
} from "./guest-session";

const SECRET = "unit-test-secret-that-is-definitely-32-bytes-long";

describe("guest session", () => {
  it("round-trips a signed session", async () => {
    const now = 1_700_000_000_000;
    const issued = await issueGuestSession(SECRET, now);
    const verified = await verifyGuestSession(issued.token, SECRET, now + 1000);
    expect(verified).toEqual({
      guestId: issued.session.guestId,
      expiresAt: now + GUEST_SESSION_TTL_MS,
    });
  });

  it("keeps the guest id when re-issued", async () => {
    const first = await issueGuestSession(SECRET);
    const second = await issueGuestSession(SECRET, Date.now(), first.session.guestId);
    expect(second.session.guestId).toBe(first.session.guestId);
  });

  it("rejects tampered payloads", async () => {
    const issued = await issueGuestSession(SECRET);
    const [payload, signature] = issued.token.split(".");
    const tampered = `${payload}x.${signature}`;
    expect(await verifyGuestSession(tampered, SECRET)).toBeNull();
  });

  it("rejects the wrong secret", async () => {
    const issued = await issueGuestSession(SECRET);
    expect(
      await verifyGuestSession(
        issued.token,
        "another-secret-that-is-also-32-bytes-long!!",
      ),
    ).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const now = 1_700_000_000_000;
    const issued = await issueGuestSession(SECRET, now);
    expect(
      await verifyGuestSession(issued.token, SECRET, now + GUEST_SESSION_TTL_MS + 1),
    ).toBeNull();
  });

  it("refuses short secrets", async () => {
    await expect(issueGuestSession("short")).rejects.toThrow(/32 bytes/u);
  });

  it("reads a single cookie from a header", () => {
    expect(readCookie("a=1; hivemind_guest=tok.sig; b=2", "hivemind_guest")).toBe(
      "tok.sig",
    );
    expect(readCookie("a=1", "hivemind_guest")).toBeNull();
    expect(readCookie(null, "hivemind_guest")).toBeNull();
  });
});
