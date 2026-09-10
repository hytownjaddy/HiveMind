import { z } from "zod";

import { capabilitySchema } from "./capability";
import { labStatusSchema } from "./common/enums";
import { labSessionIdSchema } from "./common/ids";
import {
  jsonObjectSchema,
  positiveIntSchema,
  semverSchema,
  slugSchema,
  timestampSchema,
  urlSchema,
} from "./common/primitives";

/*
 * LabSpec and the LabProvider contract (D-035, LAB_AUTHORING.md). Stage 02
 * implements providers; Stage 01 fixes the shapes they exchange.
 */

export const labNodeSchema = z.strictObject({
  name: slugSchema,
  /** Container image reference, pinned by tag or digest (invariant 5). */
  image: z.string().min(1).max(300),
  role: z.enum(["host", "router", "switch", "server", "client", "runner"]),
  /** Provider-specific startup configuration owned by a versioned module. */
  config: jsonObjectSchema.optional(),
});
export type LabNode = z.infer<typeof labNodeSchema>;

export const labLinkSchema = z.strictObject({
  a: z.string().min(1).describe("node:interface"),
  b: z.string().min(1).describe("node:interface"),
});
export type LabLink = z.infer<typeof labLinkSchema>;

export const labResourcesSchema = z.strictObject({
  cpu_millicores: positiveIntSchema,
  memory_mb: positiveIntSchema,
  disk_mb: positiveIntSchema,
});

export const labNetworkPolicySchema = z.strictObject({
  egress: z.enum(["deny", "allowlist"]),
  allowlist: z.array(z.string().min(1)),
});

export const labSpecSchema = z.strictObject({
  id: slugSchema,
  version: semverSchema,
  title: z.string().min(1).max(200),
  requires: z.array(capabilitySchema).min(1),
  nodes: z.array(labNodeSchema).min(1),
  links: z.array(labLinkSchema),
  resources: labResourcesSchema,
  network: labNetworkPolicySchema,
  /** Hard TTL; the session object destroys the lab when it elapses (D-001 security notes). */
  ttl_minutes: positiveIntSchema,
  /** Whether the provider must support snapshot/reset for this lab. */
  snapshot: z.boolean(),
});
export type LabSpec = z.infer<typeof labSpecSchema>;

export const labProviderKindSchema = z.enum(["echo", "sandbox", "lab_worker"]);

export const labProviderDescriptorSchema = z.strictObject({
  id: slugSchema,
  kind: labProviderKindSchema,
  version: semverSchema,
  capabilities: z.array(capabilitySchema),
  endpoint: urlSchema.optional(),
});
export type LabProviderDescriptor = z.infer<typeof labProviderDescriptorSchema>;

export const providerHealthSchema = z.strictObject({
  provider_id: slugSchema,
  ok: z.boolean(),
  checked_at: timestampSchema,
  detail: z.string().max(500).optional(),
  active_sessions: z.int().min(0),
});
export type ProviderHealth = z.infer<typeof providerHealthSchema>;

export const provisionRequestSchema = z.strictObject({
  lab_session_id: labSessionIdSchema,
  lab_spec: labSpecSchema,
  seed: z.int().min(0),
});
export type ProvisionRequest = z.infer<typeof provisionRequestSchema>;

export const provisionResultSchema = z.strictObject({
  lab_session_id: labSessionIdSchema,
  provider_id: slugSchema,
  status: labStatusSchema,
  /** Provider handle for later calls (container ids, topology name). */
  handle: z.string().min(1),
  nodes: z.array(
    z.strictObject({ name: slugSchema, address: z.string().min(1).optional() }),
  ),
});
export type ProvisionResult = z.infer<typeof provisionResultSchema>;

export const execRequestSchema = z.strictObject({
  lab_session_id: labSessionIdSchema,
  node: slugSchema,
  command: z.array(z.string()).min(1),
  timeout_seconds: positiveIntSchema,
});
export type ExecRequest = z.infer<typeof execRequestSchema>;

export const execResultSchema = z.strictObject({
  exit_code: z.int(),
  stdout: z.string(),
  stderr: z.string(),
  duration_ms: z.int().min(0),
  timed_out: z.boolean(),
});
export type ExecResult = z.infer<typeof execResultSchema>;

export const destroyRequestSchema = z.strictObject({
  lab_session_id: labSessionIdSchema,
  reason: z.enum(["completed", "expired", "requested", "failed", "orphaned"]),
});
export type DestroyRequest = z.infer<typeof destroyRequestSchema>;

export const destroyResultSchema = z.strictObject({
  lab_session_id: labSessionIdSchema,
  destroyed: z.boolean(),
  detail: z.string().max(500).optional(),
});
export type DestroyResult = z.infer<typeof destroyResultSchema>;

/**
 * Interface every provider implements (Stage 02). Grading and faults are in
 * `grader.ts` and `fault.ts`; `packages/core` selects a provider by capability.
 */
export interface LabProvider {
  readonly descriptor: LabProviderDescriptor;
  health(): Promise<ProviderHealth>;
  provision(request: ProvisionRequest): Promise<ProvisionResult>;
  exec(request: ExecRequest): Promise<ExecResult>;
  destroy(request: DestroyRequest): Promise<DestroyResult>;
}
