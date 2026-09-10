import { z } from "zod";

import { capabilitySchema } from "./capability";
import { definitionStatusSchema } from "./common/enums";
import {
  dottedIdSchema,
  jsonObjectSchema,
  positiveIntSchema,
  semverSchema,
  sha256Schema,
  slugSchema,
} from "./common/primitives";
import { faultParameterSchema } from "./fault";
import { labNetworkPolicySchema, labResourcesSchema, labSpecSchema } from "./lab";

/*
 * Topology archetypes (Stage 02, LAB_AUTHORING.md). An archetype is the
 * declarative part of a topology family: parameters that vary by seed, pinned
 * images per role, resource and network policy, and the name of the versioned
 * generator in `packages/core` that turns (archetype, seed, parameters) into a
 * concrete `LabSpec`. Instantiation is deterministic (invariant 5): the same
 * archetype version and seed always produce the same spec hash.
 */

export const topologyArchetypeSchema = z.strictObject({
  id: dottedIdSchema,
  version: semverSchema,
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(600),
  status: definitionStatusSchema,
  /** Alternative ids accepted by `hivemind lab up` and the API. */
  aliases: z.array(dottedIdSchema),
  requires: z.array(capabilitySchema).min(1),
  /** Generator id in `packages/core/src/labs/generators`, versioned with the archetype. */
  generator: slugSchema,
  /** Variation dimensions resolved from the seed. */
  parameters: z.array(faultParameterSchema),
  /** Container image per node role, pinned by tag and digest (invariant 5). */
  images: z.record(z.string().min(1), z.string().min(1).max(300)),
  resources: labResourcesSchema,
  network: labNetworkPolicySchema,
  ttl_minutes: positiveIntSchema,
  snapshot: z.boolean(),
  /** Generator-specific options owned by the generator's version. */
  options: jsonObjectSchema.optional(),
});
export type TopologyArchetype = z.infer<typeof topologyArchetypeSchema>;

/** A rendered topology: the concrete spec plus everything needed to replay it. */
export const topologyInstanceSchema = z.strictObject({
  archetype_id: dottedIdSchema,
  archetype_version: semverSchema,
  generator: slugSchema,
  seed: z.int().min(0),
  /** Resolved parameter values (seeded or overridden). */
  parameters: jsonObjectSchema,
  lab_spec: labSpecSchema,
  /** SHA-256 over the canonical instance without this field; equal hashes are identical labs. */
  spec_hash: sha256Schema,
});
export type TopologyInstance = z.infer<typeof topologyInstanceSchema>;

/*
 * Node configuration understood by providers. `LabSpec.nodes[].config` stays
 * an open object (invariant 1); generators emit one of these shapes and the
 * worker parses them through the generated Pydantic model.
 */

export const interfaceConfigSchema = z.strictObject({
  name: z.string().min(1).max(15),
  /** CIDR, e.g. 10.0.12.1/30. */
  ipv4: z
    .string()
    .regex(/^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/u, "invalid-ipv4-cidr")
    .optional(),
});

export const bgpNeighborConfigSchema = z.strictObject({
  address: z.string().regex(/^\d{1,3}(?:\.\d{1,3}){3}$/u, "invalid-ipv4"),
  remote_asn: z.int().min(1).max(4294967295),
  description: z.string().max(80).optional(),
  route_reflector_client: z.boolean().optional(),
});

export const labNodeConfigSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("linux"),
    hostname: slugSchema.optional(),
    interfaces: z.array(interfaceConfigSchema),
    /** Static routes `prefix via gateway`. */
    routes: z.array(
      z.strictObject({
        prefix: z.string().min(1),
        via: z.string().regex(/^\d{1,3}(?:\.\d{1,3}){3}$/u, "invalid-ipv4"),
      }),
    ),
    /** Shell started for the learner's PTY. */
    shell: z.string().min(1).max(200),
  }),
  z.strictObject({
    kind: z.literal("frr"),
    hostname: slugSchema.optional(),
    asn: z.int().min(1).max(4294967295),
    router_id: z.string().regex(/^\d{1,3}(?:\.\d{1,3}){3}$/u, "invalid-ipv4"),
    interfaces: z.array(interfaceConfigSchema),
    loopback: interfaceConfigSchema.optional(),
    bgp: z.strictObject({
      neighbors: z.array(bgpNeighborConfigSchema),
      /** Prefixes announced with `network`. */
      networks: z.array(z.string().min(1)),
      cluster_id: z
        .string()
        .regex(/^\d{1,3}(?:\.\d{1,3}){3}$/u)
        .optional(),
    }),
    /** FRR daemons enabled beyond zebra and staticd. */
    daemons: z.array(z.enum(["bgpd", "ospfd", "isisd", "ldpd", "bfdd"])),
    shell: z.string().min(1).max(200),
  }),
]);
export type LabNodeConfig = z.infer<typeof labNodeConfigSchema>;
