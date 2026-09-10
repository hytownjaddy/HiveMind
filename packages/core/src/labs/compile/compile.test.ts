import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GENERATORS } from "../generators/index";
import { instantiateTopology } from "../instantiate";
import { checkGenerated, compileArchetypes } from "./index";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");

describe("content/topologies", () => {
  it("compiles, and the committed archetypes.generated.json is in sync", () => {
    const compiled = compileArchetypes(ROOT, Object.keys(GENERATORS));
    expect(compiled.errors).toEqual([]);
    expect(compiled.archetypes.map((a) => a.id)).toEqual([
      "bgp.dual_spine",
      "bgp.route_reflector",
      "linux.pair",
      "linux.single",
    ]);
    expect(checkGenerated(ROOT, Object.keys(GENERATORS))).toEqual([]);
  });

  it("every archetype instantiates for several seeds with a stable hash", async () => {
    const { archetypes } = compileArchetypes(ROOT, Object.keys(GENERATORS));
    for (const archetype of archetypes) {
      for (const seed of [1, 7, 42]) {
        const first = await instantiateTopology(archetype, seed);
        const second = await instantiateTopology(archetype, seed);
        expect(first.spec_hash).toBe(second.spec_hash);
        expect(first.lab_spec.requires).toEqual(archetype.requires);
        expect(first.lab_spec.nodes.length).toBeGreaterThan(0);
      }
    }
  });
});
