import type { LabLink, LabNode, LabNodeConfig, LabSpec } from "@hivemind/schema";

import { intParameter, stringParameter } from "../parameters";
import { imageFor, specEnvelope, type GeneratorInput } from "./index";

/*
 * BGP archetypes (D-012: BGP immediately after Linux). Addressing is
 * deterministic in the node index so a seed reproduces the exact topology:
 *   spine s ↔ leaf l   10.0.<s>.<2(l-1)>/31 (spine even, leaf odd)
 *   loopbacks          10.255.<tier>.<n>/32
 *   ASN schemes        private: 65000 + n; public: RFC 5398 64496 + n
 */

const SHELL = "/bin/bash";

type FrrConfig = Extract<LabNodeConfig, { kind: "frr" }>;

function asnFor(scheme: string, index: number): number {
  return scheme === "public" ? 64496 + index : 65000 + index;
}

function router(name: string, image: string, config: FrrConfig): LabNode {
  return { name, image, role: "router", config };
}

function frr(
  hostname: string,
  asn: number,
  routerId: string,
  interfaces: FrrConfig["interfaces"],
  neighbors: FrrConfig["bgp"]["neighbors"],
  extra: Partial<Pick<FrrConfig["bgp"], "cluster_id">> = {},
): FrrConfig {
  return {
    kind: "frr",
    hostname,
    asn,
    router_id: routerId,
    interfaces,
    loopback: { name: "lo", ipv4: `${routerId}/32` },
    bgp: { neighbors, networks: [`${routerId}/32`], ...extra },
    daemons: ["bgpd"],
    shell: SHELL,
  };
}

/** Two spines in one ASN, N leaves each in their own ASN, eBGP over /31 links. */
export function dualSpine({ archetype, parameters }: GeneratorInput): LabSpec {
  const leafCount = intParameter(parameters, "leaf_count");
  const scheme = stringParameter(parameters, "asn_scheme");
  const image = imageFor(archetype, "router");
  const spineAsn = asnFor(scheme, 0);
  const nodes: LabNode[] = [];
  const links: LabLink[] = [];

  for (let spine = 1; spine <= 2; spine += 1) {
    const routerId = `10.255.0.${spine}`;
    const interfaces: FrrConfig["interfaces"] = [];
    const neighbors: FrrConfig["bgp"]["neighbors"] = [];
    for (let leaf = 1; leaf <= leafCount; leaf += 1) {
      const octet = 2 * (leaf - 1);
      interfaces.push({ name: `eth${leaf}`, ipv4: `10.0.${spine}.${octet}/31` });
      neighbors.push({
        address: `10.0.${spine}.${octet + 1}`,
        remote_asn: asnFor(scheme, leaf),
        description: `leaf${leaf}`,
      });
      links.push({ a: `spine${spine}:eth${leaf}`, b: `leaf${leaf}:eth${spine}` });
    }
    nodes.push(
      router(
        `spine${spine}`,
        image,
        frr(`spine${spine}`, spineAsn, routerId, interfaces, neighbors),
      ),
    );
  }
  for (let leaf = 1; leaf <= leafCount; leaf += 1) {
    const octet = 2 * (leaf - 1);
    const routerId = `10.255.1.${leaf}`;
    nodes.push(
      router(
        `leaf${leaf}`,
        image,
        frr(
          `leaf${leaf}`,
          asnFor(scheme, leaf),
          routerId,
          [
            { name: "eth1", ipv4: `10.0.1.${octet + 1}/31` },
            { name: "eth2", ipv4: `10.0.2.${octet + 1}/31` },
          ],
          [
            { address: `10.0.1.${octet}`, remote_asn: spineAsn, description: "spine1" },
            { address: `10.0.2.${octet}`, remote_asn: spineAsn, description: "spine2" },
          ],
        ),
      ),
    );
  }
  return { ...specEnvelope(archetype), nodes, links };
}

/** One ASN: `rr_count` reflectors in a full mesh, `client_count` clients peering with every reflector. */
export function routeReflector({ archetype, parameters }: GeneratorInput): LabSpec {
  const rrCount = intParameter(parameters, "rr_count");
  const clientCount = intParameter(parameters, "client_count");
  const scheme = stringParameter(parameters, "asn_scheme");
  const asn = asnFor(scheme, 0);
  const image = imageFor(archetype, "router");
  const nodes: LabNode[] = [];
  const links: LabLink[] = [];
  // iBGP sessions run between loopbacks reached over directly connected /31s;
  // reflectors keep a full mesh among themselves (RFC 4456 §7 topology).
  const rrLoopback = (rr: number): string => `10.255.0.${rr}`;
  const clientLoopback = (client: number): string => `10.255.1.${client}`;

  for (let rr = 1; rr <= rrCount; rr += 1) {
    const interfaces: FrrConfig["interfaces"] = [];
    const neighbors: FrrConfig["bgp"]["neighbors"] = [];
    let port = 1;
    for (let client = 1; client <= clientCount; client += 1) {
      const octet = 2 * (client - 1);
      interfaces.push({ name: `eth${port}`, ipv4: `10.0.${rr}.${octet}/31` });
      neighbors.push({
        address: clientLoopback(client),
        remote_asn: asn,
        description: `client${client}`,
        route_reflector_client: true,
      });
      links.push({ a: `rr${rr}:eth${port}`, b: `client${client}:eth${rr}` });
      port += 1;
    }
    for (let other = rr + 1; other <= rrCount; other += 1) {
      interfaces.push({ name: `eth${port}`, ipv4: `10.0.9.${2 * (rr - 1)}/31` });
      links.push({ a: `rr${rr}:eth${port}`, b: `rr${other}:eth${port}` });
      port += 1;
    }
    for (let other = 1; other <= rrCount; other += 1) {
      if (other !== rr) {
        neighbors.push({
          address: rrLoopback(other),
          remote_asn: asn,
          description: `rr${other}`,
        });
      }
    }
    nodes.push(
      router(
        `rr${rr}`,
        image,
        frr(`rr${rr}`, asn, rrLoopback(rr), interfaces, neighbors, {
          cluster_id: "10.255.0.100",
        }),
      ),
    );
  }
  for (let client = 1; client <= clientCount; client += 1) {
    const octet = 2 * (client - 1);
    const interfaces: FrrConfig["interfaces"] = [];
    const neighbors: FrrConfig["bgp"]["neighbors"] = [];
    for (let rr = 1; rr <= rrCount; rr += 1) {
      interfaces.push({ name: `eth${rr}`, ipv4: `10.0.${rr}.${octet + 1}/31` });
      neighbors.push({
        address: rrLoopback(rr),
        remote_asn: asn,
        description: `rr${rr}`,
      });
    }
    nodes.push(
      router(
        `client${client}`,
        image,
        frr(`client${client}`, asn, clientLoopback(client), interfaces, neighbors),
      ),
    );
  }
  return { ...specEnvelope(archetype), nodes, links };
}
