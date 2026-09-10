import { describe, expect, it } from "vitest";

import {
  SESSION_PROTOCOL_VERSION,
  createSessionRequestSchema,
  ptyControlMessageSchema,
  sessionClientMessageSchema,
  sessionServerMessageSchema,
} from "./session-transport";
import { topologyArchetypeSchema } from "./topology";
import { dualSpineArchetype } from "./fixtures/stage02";

describe("session transport v2", () => {
  it("uses snake_case fields and rejects unknown ones (D-046)", () => {
    expect(
      createSessionRequestSchema.safeParse({ archetype: "linux.single", seed: 1 })
        .success,
    ).toBe(true);
    expect(
      createSessionRequestSchema.safeParse({ archetype: "linux.single", seed: 1, x: 1 })
        .success,
    ).toBe(false);
    expect(
      createSessionRequestSchema.safeParse({ archetype: "single", seed: 1 }).success,
    ).toBe(false);
  });

  it("rejects messages from another protocol version", () => {
    expect(
      sessionClientMessageSchema.safeParse({
        protocol_version: SESSION_PROTOCOL_VERSION + 1,
        type: "resync",
        latest_sequence: 0,
      }).success,
    ).toBe(false);
  });

  it("bounds PTY chunks and requires a node", () => {
    expect(
      sessionClientMessageSchema.safeParse({
        protocol_version: 2,
        type: "pty_input",
        node: "host1",
        data: "x".repeat(16 * 1024 + 1),
      }).success,
    ).toBe(false);
    expect(
      sessionClientMessageSchema.safeParse({
        protocol_version: 2,
        type: "pty_input",
        data: "x",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown server fields", () => {
    expect(
      sessionServerMessageSchema.safeParse({
        protocol_version: 2,
        type: "pty_ready",
        node: "host1",
        extra: true,
      }).success,
    ).toBe(false);
  });

  it("shares the PTY control shape with the Sandbox terminal protocol", () => {
    expect(ptyControlMessageSchema.parse({ type: "resize", cols: 80, rows: 24 })).toEqual(
      {
        type: "resize",
        cols: 80,
        rows: 24,
      },
    );
    expect(
      ptyControlMessageSchema.safeParse({ type: "resize", cols: 0, rows: 24 }).success,
    ).toBe(false);
  });
});

describe("topology archetype", () => {
  it("requires at least one capability and pinned images per role", () => {
    expect(topologyArchetypeSchema.parse(dualSpineArchetype).images.router).toContain(
      "@sha256:",
    );
    expect(
      topologyArchetypeSchema.safeParse({ ...dualSpineArchetype, requires: [] }).success,
    ).toBe(false);
  });
});
