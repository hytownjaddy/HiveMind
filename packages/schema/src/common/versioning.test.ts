import { describe, expect, it } from "vitest";

import { bumpSemver, canonicalJson, compareSemver, hashCanonical } from "./versioning";

describe("semver helpers", () => {
  it("compares and bumps", () => {
    expect(compareSemver("1.2.3", "1.10.0")).toBe(-1);
    expect(compareSemver("2.0.0", "1.99.99")).toBe(1);
    expect(compareSemver("1.0.0", "1.0.0")).toBe(0);
    expect(bumpSemver("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpSemver("1.2.3", "major")).toBe("2.0.0");
    expect(bumpSemver("1.2.3", "patch")).toBe("1.2.4");
    expect(() => compareSemver("1.2", "1.2.3")).toThrow();
  });
});

describe("canonical JSON and hashing", () => {
  it("sorts keys recursively and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[3,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("hashes independently of key order", async () => {
    const left = await hashCanonical({ seed: 1, problem: "x" });
    const right = await hashCanonical({ problem: "x", seed: 1 });
    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/u);
  });
});
