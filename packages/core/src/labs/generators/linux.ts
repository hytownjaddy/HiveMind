import type { LabNode, LabNodeConfig, LabSpec } from "@hivemind/schema";

import { intParameter } from "../parameters";
import { imageFor, specEnvelope, type GeneratorInput } from "./index";

/*
 * Linux archetypes (D-012: Linux first). `linux.single` is one host on the
 * management network only; `linux.pair` links two hosts over a seeded /30 so
 * routing, ARP, and reachability exercises have a real neighbour.
 */

const SHELL = "/bin/bash";

function hostNode(name: string, image: string, config: LabNodeConfig): LabNode {
  return { name, image, role: "host", config };
}

export function linuxSingle({ archetype }: GeneratorInput): LabSpec {
  return {
    ...specEnvelope(archetype),
    nodes: [
      hostNode("host1", imageFor(archetype, "host"), {
        kind: "linux",
        hostname: "host1",
        interfaces: [],
        routes: [],
        shell: SHELL,
      }),
    ],
    links: [],
  };
}

/** Seeded /30 inside 10.<a>.<b>.0; the second octet pair varies per seed. */
export function linuxPair({ archetype, parameters, random }: GeneratorInput): LabSpec {
  const second = intParameter(parameters, "subnet_second_octet");
  const third = random.int(0, 255);
  const base = `10.${second}.${third}`;
  const image = imageFor(archetype, "host");
  return {
    ...specEnvelope(archetype),
    nodes: [
      hostNode("host1", image, {
        kind: "linux",
        hostname: "host1",
        interfaces: [{ name: "eth1", ipv4: `${base}.1/30` }],
        routes: [],
        shell: SHELL,
      }),
      hostNode("host2", image, {
        kind: "linux",
        hostname: "host2",
        interfaces: [{ name: "eth1", ipv4: `${base}.2/30` }],
        routes: [],
        shell: SHELL,
      }),
    ],
    links: [{ a: "host1:eth1", b: "host2:eth1" }],
  };
}
