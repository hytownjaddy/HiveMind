import { describe, expect, it } from "vitest";

import {
  createLabSessionRequestSchema,
  labCapabilitySchema,
  labClientMessageSchema,
  labServerMessageSchema,
} from "./lab-session";
import { PROTOCOL_VERSION } from "./version";

describe("capability ids", () => {
  it("accepts dotted plugin-style ids", () => {
    expect(labCapabilitySchema.parse(" terminal.linux ")).toBe("terminal.linux");
    expect(labCapabilitySchema.parse("network.frr")).toBe("network.frr");
  });

  it("rejects ids without a namespace", () => {
    expect(labCapabilitySchema.safeParse("terminal").success).toBe(false);
    expect(labCapabilitySchema.safeParse("Terminal.Linux").success).toBe(false);
  });
});

describe("create request", () => {
  it("rejects unknown fields", () => {
    const result = createLabSessionRequestSchema.safeParse({
      capability: "terminal.linux",
      extra: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("messages", () => {
  it("rejects messages from a different protocol version", () => {
    const result = labClientMessageSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION + 1,
      type: "resync",
      latestSequence: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized terminal chunks", () => {
    const result = labClientMessageSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION,
      type: "terminal_input",
      data: "x".repeat(16 * 1024 + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown server fields", () => {
    const result = labServerMessageSchema.safeParse({
      protocolVersion: PROTOCOL_VERSION,
      type: "rejected",
      code: "malformed",
      revision: 1,
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});
