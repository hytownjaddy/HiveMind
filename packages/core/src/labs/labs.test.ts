import {
  labNodeConfigSchema,
  type LabProviderDescriptor,
  type TopologyArchetype,
} from "@hivemind/schema";
import { describe, expect, it } from "vitest";

import { ArchetypeRegistry } from "./archetypes";
import { instantiateTopology } from "./instantiate";
import { ParameterError } from "./parameters";
import { parseRecording, serializeRecording } from "./recording";
import { REDACTION_VERSION, StreamingRedactor, redactText } from "./redaction";
import { SeededRandom } from "./seed";
import { executionClassOf, selectProvider, type ProviderCandidate } from "./selection";

const FRR =
  "quay.io/frrouting/frr:10.7.1@sha256:e995beaa50fdc9edb35eadcfefa29b7f062cc06f2b812613789b68fa541554d2";

function archetype(overrides: Partial<TopologyArchetype>): TopologyArchetype {
  return {
    id: "bgp.dual_spine",
    version: "1.0.0",
    title: "Dual spine",
    description: "Two spines, N leaves.",
    status: "active",
    aliases: [],
    requires: ["network.containerlab", "routing.frr", "privilege.net_admin"],
    generator: "bgp.dual_spine",
    parameters: [
      { name: "leaf_count", kind: "int_range", values: [2, 4] },
      { name: "asn_scheme", kind: "choice", values: ["private", "public"] },
    ],
    images: { router: FRR },
    resources: { cpu_millicores: 2000, memory_mb: 2048, disk_mb: 4096 },
    network: { egress: "deny", allowlist: [] },
    ttl_minutes: 120,
    snapshot: false,
    ...overrides,
  };
}

const linuxSingle = archetype({
  id: "linux.single",
  generator: "linux.single",
  aliases: ["linux.basic"],
  requires: ["shell.linux"],
  parameters: [],
  images: { host: "hivemind/linux-lab:1.0.0" },
});

const linuxPair = archetype({
  id: "linux.pair",
  generator: "linux.pair",
  requires: ["shell.linux", "network.veth"],
  parameters: [{ name: "subnet_second_octet", kind: "int_range", values: [1, 250] }],
  images: { host: "hivemind/linux-lab:1.0.0" },
});

const routeReflector = archetype({
  id: "bgp.route_reflector",
  generator: "bgp.route_reflector",
  parameters: [
    { name: "rr_count", kind: "int_range", values: [1, 2] },
    { name: "client_count", kind: "int_range", values: [2, 4] },
    { name: "asn_scheme", kind: "choice", values: ["private", "public"] },
  ],
});

describe("seeded random", () => {
  it("is deterministic per (salt, seed) and differs across seeds", () => {
    const a = new SeededRandom(7, "x");
    const b = new SeededRandom(7, "x");
    const c = new SeededRandom(8, "x");
    const streamA = [a.int(0, 100), a.int(0, 100), a.int(0, 100)];
    expect(streamA).toEqual([b.int(0, 100), b.int(0, 100), b.int(0, 100)]);
    expect(streamA).not.toEqual([c.int(0, 100), c.int(0, 100), c.int(0, 100)]);
  });
});

describe("instantiation (invariant 5)", () => {
  it("renders the same spec hash for the same archetype version and seed", async () => {
    const first = await instantiateTopology(archetype({}), 7);
    const second = await instantiateTopology(archetype({}), 7);
    expect(first.spec_hash).toBe(second.spec_hash);
    expect(first.lab_spec).toEqual(second.lab_spec);
    const other = await instantiateTopology(archetype({}), 8);
    expect(other.spec_hash).not.toBe(first.spec_hash);
    const bumped = await instantiateTopology(archetype({ version: "1.0.1" }), 7);
    expect(bumped.spec_hash).not.toBe(first.spec_hash);
  });

  it("draws parameters from the seed and honours validated overrides", async () => {
    const seeded = await instantiateTopology(archetype({}), 7);
    expect([2, 3, 4]).toContain(seeded.parameters["leaf_count"]);
    const forced = await instantiateTopology(archetype({}), 7, { leaf_count: 4 });
    expect(forced.parameters["leaf_count"]).toBe(4);
    expect(forced.lab_spec.nodes.map((n) => n.name)).toEqual([
      "spine1",
      "spine2",
      "leaf1",
      "leaf2",
      "leaf3",
      "leaf4",
    ]);
    await expect(
      instantiateTopology(archetype({}), 7, { leaf_count: 9 }),
    ).rejects.toThrow(ParameterError);
    await expect(instantiateTopology(archetype({}), 7, { nope: 1 })).rejects.toThrow(
      ParameterError,
    );
  });

  it("dual spine: every leaf peers with both spines over matching /31s", async () => {
    const instance = await instantiateTopology(archetype({}), 3, {
      leaf_count: 2,
      asn_scheme: "private",
    });
    const spec = instance.lab_spec;
    expect(spec.links).toHaveLength(4);
    const byName = new Map(spec.nodes.map((n) => [n.name, n]));
    const leaf1 = labNodeConfigSchema.parse(byName.get("leaf1")?.config);
    const spine1 = labNodeConfigSchema.parse(byName.get("spine1")?.config);
    if (leaf1.kind !== "frr" || spine1.kind !== "frr") {
      throw new Error("expected frr nodes");
    }
    expect(leaf1.asn).toBe(65001);
    expect(spine1.asn).toBe(65000);
    expect(leaf1.interfaces[0]?.ipv4).toBe("10.0.1.1/31");
    expect(spine1.interfaces[0]?.ipv4).toBe("10.0.1.0/31");
    expect(spine1.bgp.neighbors.map((n) => n.address)).toEqual(["10.0.1.1", "10.0.1.3"]);
    expect(leaf1.bgp.neighbors.map((n) => n.remote_asn)).toEqual([65000, 65000]);
    for (const node of spec.nodes) {
      expect(node.image).toBe(FRR);
    }
  });

  it("route reflector: clients are reflector clients in one ASN", async () => {
    const instance = await instantiateTopology(routeReflector, 5, {
      rr_count: 2,
      client_count: 3,
      asn_scheme: "public",
    });
    const nodes = instance.lab_spec.nodes;
    expect(nodes.map((n) => n.name)).toEqual([
      "rr1",
      "rr2",
      "client1",
      "client2",
      "client3",
    ]);
    const rr1 = labNodeConfigSchema.parse(nodes[0]?.config);
    if (rr1.kind !== "frr") throw new Error("expected frr");
    expect(rr1.asn).toBe(64496);
    expect(rr1.bgp.neighbors.filter((n) => n.route_reflector_client)).toHaveLength(3);
    expect(rr1.bgp.neighbors.find((n) => n.description === "rr2")).toBeDefined();
    expect(rr1.bgp.cluster_id).toBe("10.255.0.100");
    // Every router's ASN is the same in an RR topology.
    for (const node of nodes) {
      const config = labNodeConfigSchema.parse(node.config);
      expect(config.kind === "frr" && config.asn).toBe(64496);
    }
    expect(instance.lab_spec.links).toHaveLength(2 * 3 + 1);
  });

  it("linux archetypes: single host has no links; pair shares a seeded /30", async () => {
    const single = await instantiateTopology(linuxSingle, 1);
    expect(single.lab_spec.nodes).toHaveLength(1);
    expect(single.lab_spec.links).toEqual([]);
    const pair = await instantiateTopology(linuxPair, 11);
    const [a, b] = pair.lab_spec.nodes.map((n) => labNodeConfigSchema.parse(n.config));
    if (a?.kind !== "linux" || b?.kind !== "linux") throw new Error("expected linux");
    const prefix = a.interfaces[0]?.ipv4?.replace(/\.1\/30$/u, "");
    expect(b.interfaces[0]?.ipv4).toBe(`${prefix}.2/30`);
    expect(pair.lab_spec.links).toEqual([{ a: "host1:eth1", b: "host2:eth1" }]);
  });
});

describe("archetype registry", () => {
  it("resolves ids and aliases and rejects collisions", () => {
    const registry = new ArchetypeRegistry([linuxSingle, archetype({})]);
    expect(registry.resolve("linux.basic")?.id).toBe("linux.single");
    expect(registry.resolve("bgp.dual_spine")?.id).toBe("bgp.dual_spine");
    expect(registry.resolve("nope.nope")).toBeNull();
    expect(registry.images().map((row) => row.role)).toEqual(["router", "host"]);
    expect(
      () => new ArchetypeRegistry([linuxSingle, archetype({ id: "linux.basic" })]),
    ).toThrow(/collides|duplicate/u);
  });
});

describe("provider selection (acceptance 4)", () => {
  const sandbox: LabProviderDescriptor = {
    id: "cloudflare-sandbox",
    kind: "sandbox",
    version: "0.12.9",
    capabilities: ["shell.linux", "python", "node"],
  };
  const worker: LabProviderDescriptor = {
    id: "ubuntu-lab-worker-1",
    kind: "lab_worker",
    version: "0.2.0",
    capabilities: [
      "shell.linux",
      "network.namespace",
      "network.veth",
      "network.bridge",
      "network.containerlab",
      "routing.frr",
      "privilege.net_admin",
    ],
  };
  const candidates = (online: {
    sandbox: boolean;
    worker: boolean;
  }): ProviderCandidate[] => [
    { descriptor: sandbox, online: online.sandbox, activeSessions: 0 },
    { descriptor: worker, online: online.worker, activeSessions: 0 },
  ];

  it("never places routing.frr on the sandbox", () => {
    const selected = selectProvider(
      ["routing.frr", "network.containerlab"],
      candidates({ sandbox: true, worker: true }),
    );
    expect(selected.ok && selected.provider.kind).toBe("lab_worker");
    expect(selected.ok && selected.executionClass).toBe("B");
    const workerDown = selectProvider(
      ["routing.frr"],
      candidates({ sandbox: true, worker: false }),
    );
    expect(workerDown.ok).toBe(false);
    expect(!workerDown.ok && workerDown.code).toBe("no_provider_online");
  });

  it("places shell.linux-only specs on the Class C choice", () => {
    const selected = selectProvider(
      ["shell.linux"],
      candidates({ sandbox: true, worker: true }),
    );
    expect(selected.ok && selected.executionClass).toBe("C");
    expect(selected.ok && selected.provider.kind).toBe("lab_worker");
    const flipped = selectProvider(
      ["shell.linux"],
      candidates({ sandbox: true, worker: true }),
      ["sandbox", "lab_worker"],
    );
    expect(flipped.ok && flipped.provider.kind).toBe("sandbox");
    const workerDown = selectProvider(
      ["shell.linux"],
      candidates({ sandbox: true, worker: false }),
    );
    expect(workerDown.ok && workerDown.provider.kind).toBe("sandbox");
  });

  it("fails unsatisfiable specs with the missing capabilities", () => {
    const selected = selectProvider(
      ["orchestration.kubernetes", "shell.linux"],
      candidates({ sandbox: true, worker: true }),
    );
    expect(selected.ok).toBe(false);
    if (selected.ok) throw new Error("unexpected");
    expect(selected.code).toBe("unsatisfiable");
    expect(selected.unsatisfied).toEqual(["orchestration.kubernetes"]);
    expect(selected.message).toContain("orchestration.kubernetes");
    expect(executionClassOf(["python"])).toBe("A");
    expect(executionClassOf(["shell.linux"])).toBe("C");
    expect(executionClassOf(["unknown.thing"])).toBe("B");
  });
});

describe("redaction (D-019)", () => {
  it("masks tokens, passwords, keys, and URL credentials while keeping the key names", () => {
    const text = [
      "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
      "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789",
      "password: hunter2hunter2",
      "token=ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "git clone https://jacob:s3cr3tpass@github.com/x/y.git",
      "CF-Access-Client-Secret: 0123456789abcdef0123456789abcdef",
      "safe line: ip route show table main",
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW",
      "-----END OPENSSH PRIVATE KEY-----",
    ].join("\n");
    const redacted = redactText(text);
    expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(redacted).not.toContain("wJalrXUtnFEMI");
    expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz0123456789");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("s3cr3tpass");
    expect(redacted).not.toContain("0123456789abcdef0123456789abcdef");
    expect(redacted).not.toContain("b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQ");
    expect(redacted).toContain("password: [REDACTED SECRET]");
    expect(redacted).toContain("https://jacob:[REDACTED URL CREDENTIAL]@github.com");
    expect(redacted).toContain("safe line: ip route show table main");
    expect(redacted).toContain("[REDACTED PRIVATE KEY]");
    expect(REDACTION_VERSION).toBe("1.0.0");
  });

  it("streams: a token split across frames is still masked; keys are held until END", () => {
    const redactor = new StreamingRedactor();
    let output = redactor.push("token=ghp_abcdefghijklmn");
    expect(output).toBe("");
    output += redactor.push("opqrstuvwxyz0123456789\r\n$ ");
    expect(output).toContain("token=[REDACTED SECRET]");
    expect(output.endsWith("\r\n")).toBe(true);
    expect(redactor.pendingLength).toBe(2);
    output = redactor.push("-----BEGIN RSA PRIVATE KEY-----\nMIIE\n");
    expect(output).toBe("");
    output = redactor.push("-----END RSA PRIVATE KEY-----\n");
    expect(output).toBe("$ [REDACTED PRIVATE KEY]\n");
    expect(redactor.flush()).toBe("");
  });
});

describe("recordings", () => {
  it("serializes asciicast v2 and parses it back", () => {
    const header = {
      version: 2 as const,
      width: 80,
      height: 24,
      timestamp: 1788955200,
      title: "HM-LAB-000001 · host1",
      env: { TERM: "xterm-256color", SHELL: "/bin/bash" },
      hivemind: {
        lab_session_id: "HM-LAB-000001",
        node: "host1",
        provider_id: "ubuntu-lab-worker-1",
        redaction_version: REDACTION_VERSION,
        recorded_at: "2026-09-09T12:00:00Z",
      },
    };
    const text = serializeRecording(header, [
      { at_ms: 1788955200000, kind: "o", data: "$ " },
      { at_ms: 1788955201500, kind: "o", data: "ip route\r\n" },
      { at_ms: 1788955202000, kind: "r", data: "120x40" },
    ]);
    const lines = text.trimEnd().split("\n");
    expect(lines).toHaveLength(4);
    expect(JSON.parse(lines[1] ?? "")).toEqual([0, "o", "$ "]);
    expect(JSON.parse(lines[2] ?? "")).toEqual([1.5, "o", "ip route\r\n"]);
    const parsed = parseRecording(text);
    expect(parsed.header.hivemind.node).toBe("host1");
    expect(parsed.events[2]).toEqual([2, "r", "120x40"]);
  });
});

describe("lifecycle graph (RFP §86)", () => {
  it("allows the forward path, failure from anywhere, and nothing after final states", async () => {
    const { canTransition, provisionTimeoutMs } = await import("./lifecycle");
    expect(canTransition("queued", "provisioning")).toBe(true);
    expect(canTransition("provisioning", "baseline_check")).toBe(true);
    expect(canTransition("baseline_check", "ready")).toBe(true);
    expect(canTransition("ready", "active")).toBe(true);
    expect(canTransition("active", "destroying")).toBe(true);
    expect(canTransition("destroying", "destroyed")).toBe(true);
    expect(canTransition("queued", "ready")).toBe(false);
    expect(canTransition("ready", "ready")).toBe(false);
    expect(canTransition("provisioning", "failed")).toBe(true);
    expect(canTransition("destroyed", "provisioning")).toBe(false);
    expect(canTransition("failed", "destroying")).toBe(false);
    expect(provisionTimeoutMs(1)).toBe(105_000);
    expect(provisionTimeoutMs(100)).toBe(600_000);
  });
});
