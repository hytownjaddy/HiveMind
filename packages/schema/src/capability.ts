import { z } from "zod";

import { executionClassSchema } from "./common/enums";
import { dottedIdSchema } from "./common/primitives";

/*
 * Capability model (D-035, invariant 17). A lab declares the capabilities it
 * requires; HiveMind selects a provider that satisfies all of them. The
 * vocabulary is open (invariant 1); the descriptors below document the
 * capabilities known at Stage 01 and their execution class.
 */

export const capabilitySchema = dottedIdSchema.describe(
  "Capability id, e.g. shell.linux, network.containerlab, routing.frr",
);
export type Capability = z.infer<typeof capabilitySchema>;

export const capabilityDescriptorSchema = z.strictObject({
  id: capabilitySchema,
  class: executionClassSchema,
  description: z.string().min(1).max(300),
});
export type CapabilityDescriptor = z.infer<typeof capabilityDescriptorSchema>;

export const KNOWN_CAPABILITIES: readonly CapabilityDescriptor[] = [
  { id: "shell.linux", class: "C", description: "Single-node Linux shell" },
  { id: "python", class: "A", description: "Python runtime with tests and linting" },
  { id: "node", class: "A", description: "Node.js runtime with tests" },
  { id: "compiler.cpp", class: "A", description: "C++ toolchain with a build step" },
  { id: "network.namespace", class: "B", description: "Linux network namespaces" },
  { id: "network.veth", class: "B", description: "veth pairs" },
  { id: "network.bridge", class: "B", description: "Linux bridges and realistic L2" },
  { id: "network.containerlab", class: "B", description: "containerlab topologies" },
  { id: "routing.frr", class: "B", description: "FRRouting daemons" },
  { id: "privilege.net_admin", class: "B", description: "CAP_NET_ADMIN inside the lab" },
  { id: "network.automation", class: "B", description: "Python attached to a topology" },
  { id: "capture.pcap", class: "B", description: "Packet capture" },
  {
    id: "telemetry.simulated",
    class: "A",
    description: "Worker-side simulated telemetry",
  },
];

/** True when `offered` covers every capability in `required`. */
export function satisfiesCapabilities(
  required: readonly Capability[],
  offered: readonly Capability[],
): boolean {
  const available = new Set(offered);
  return required.every((capability) => available.has(capability));
}
