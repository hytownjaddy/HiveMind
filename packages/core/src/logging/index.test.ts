import { describe, expect, it } from "vitest";

import { createLogger, redact } from "./index";

describe("redaction", () => {
  it("masks tokens, keys, passwords, and cookies", () => {
    const jwt =
      "eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6ImFAYi5jbyJ9.c2lnbmF0dXJlLXNpZ25hdHVyZQ";
    expect(redact(`bearer ${jwt}`)).toBe("bearer [redacted jwt]");
    expect(redact("password=hunter2 and api_key: abc123")).toBe(
      "password=[redacted] and api_key=[redacted]",
    );
    expect(redact("cookie: CF_Authorization=abc; other")).toBe(
      "cookie: [redacted]; other",
    );
    expect(
      redact("-----BEGIN RSA PRIVATE KEY-----\nMIIE\n-----END RSA PRIVATE KEY-----"),
    ).toBe("[redacted private key]");
    expect(redact("ghp_abcdefghijklmnopqrstuvwxyz0123")).toBe("[redacted github token]");
    expect(redact("ip route add 10.0.0.0/8 via 10.0.0.1")).toBe(
      "ip route add 10.0.0.0/8 via 10.0.0.1",
    );
  });
});

describe("logger", () => {
  it("emits one redacted JSON line per event with bound fields", () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "web",
      sink: (line) => lines.push(line),
      clock: () => "2026-09-09T12:00:00Z",
    }).child({ request_id: "r1" });
    logger.info("lesson.served", {
      lesson_id: "HM-LESSON-linux-networking-01",
      authorization: "Bearer x",
      nested: { token: "t" },
    });
    logger.debug("hidden");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toEqual({
      at: "2026-09-09T12:00:00Z",
      level: "info",
      service: "web",
      event: "lesson.served",
      request_id: "r1",
      lesson_id: "HM-LESSON-linux-networking-01",
      authorization: "[redacted]",
      nested: { token: "[redacted]" },
    });
  });
});
