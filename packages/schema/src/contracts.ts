import { z } from "zod";

import {
  attemptResultSchema,
  attemptSchema,
  evidenceSchema,
  masteryUpdateSchema,
} from "./attempt";
import { capabilityDescriptorSchema, capabilitySchema } from "./capability";
import {
  careerProfileSchema,
  competencySchema,
  readinessSnapshotSchema,
  roleProfileSchema,
} from "./career";
import {
  confidenceSchema,
  connectionStateSchema,
  definitionStatusSchema,
  executionClassSchema,
  executionModeSchema,
  freshnessStateSchema,
  hintTierSchema,
  labStatusSchema,
  lessonElementSchema,
  productModeSchema,
  qaStateSchema,
  trustTierSchema,
  workOrderStatusSchema,
} from "./common/enums";
import {
  contentBundleSchema,
  contentVersionSchema,
  courseManifestSchema,
  lessonSchema,
  moduleSchema,
  questionSchema,
} from "./content";
import { checkSpecSchema, faultSpecSchema } from "./fault";
import { graderManifestSchema, graderResultSchema } from "./grader";
import {
  destroyRequestSchema,
  destroyResultSchema,
  execRequestSchema,
  execResultSchema,
  labProviderDescriptorSchema,
  labSpecSchema,
  providerHealthSchema,
  provisionRequestSchema,
  provisionResultSchema,
} from "./lab";
import { learnerSchema } from "./learner";
import { blockNodeSchema, inlineNodeSchema, lessonSectionSchema } from "./lesson-body";
import { problemInstanceSchema, problemSpecSchema } from "./problem";
import { skillDefinitionSchema, skillGraphSchema } from "./skills";
import { claimSchema, sourceRecordSchema } from "./sources";
import { reviewItemSchema, workOrderSchema } from "./work-order";
import {
  jobResultSchema,
  workerEnvelopeSchema,
  workerMessageSchema,
} from "./worker-protocol";

/*
 * Contract registry (D-032, acceptance criterion 3). Every entry is exported
 * to `schemas/<id>.schema.json`, hashed into `schemas/contracts.lock.json`
 * under `<id>@<version>`, and generated into Pydantic. Changing a schema
 * without bumping its version fails `schema:check` and CI.
 */

export interface ContractEntry {
  readonly id: string;
  readonly version: string;
  readonly description: string;
  readonly schema: z.ZodType;
}

function entry(
  id: string,
  version: string,
  description: string,
  schema: z.ZodType,
): ContractEntry {
  return { id, version, description, schema };
}

export const CONTRACTS: readonly ContractEntry[] = [
  // Vocabularies
  entry("LabStatus", "1.0.0", "Lab lifecycle, RFP §86", labStatusSchema),
  entry("ConnectionState", "1.0.0", "Session connection state", connectionStateSchema),
  entry("QaState", "1.0.0", "Content QA pipeline state", qaStateSchema),
  entry("WorkOrderStatus", "1.0.0", "Work-order state", workOrderStatusSchema),
  entry("FreshnessState", "1.0.0", "Maintenance freshness", freshnessStateSchema),
  entry("Confidence", "1.0.0", "Confidence tier beside every score", confidenceSchema),
  entry("TrustTier", "1.0.0", "Source trust tier", trustTierSchema),
  entry("ExecutionMode", "1.0.0", "AI execution mode", executionModeSchema),
  entry("ExecutionClass", "1.0.0", "Lab execution class", executionClassSchema),
  entry("HintTier", "1.0.0", "Hint tier", hintTierSchema),
  entry("ProductMode", "1.0.0", "Product mode, RFP §3", productModeSchema),
  entry(
    "DefinitionStatus",
    "1.0.0",
    "Versioned definition lifecycle",
    definitionStatusSchema,
  ),
  entry("LessonElement", "1.0.0", "RFP §110 lesson element", lessonElementSchema),
  entry("Capability", "1.0.0", "Lab capability id", capabilitySchema),
  // Learner and skills
  entry("Learner", "1.0.0", "Learner record", learnerSchema),
  entry("SkillDefinition", "1.0.0", "Versioned skill", skillDefinitionSchema),
  entry("SkillGraph", "1.0.0", "Skill graph", skillGraphSchema),
  // Content
  entry("SourceRecord", "1.0.0", "Source with provenance and trust", sourceRecordSchema),
  entry("Claim", "1.0.0", "Factual claim with provenance", claimSchema),
  entry("InlineNode", "1.0.0", "Lesson inline render node", inlineNodeSchema),
  entry("BlockNode", "1.0.0", "Lesson block render node", blockNodeSchema),
  entry(
    "LessonSection",
    "1.0.0",
    "Lesson section tagged with its §110 element",
    lessonSectionSchema,
  ),
  entry("Question", "1.0.0", "Lesson question", questionSchema),
  entry("Lesson", "1.0.0", "Compiled lesson", lessonSchema),
  entry("Module", "1.0.0", "Course module", moduleSchema),
  entry("CourseManifest", "1.0.0", "Course manifest", courseManifestSchema),
  entry("ContentBundle", "1.0.0", "Compiled content bundle", contentBundleSchema),
  entry(
    "ContentVersion",
    "1.0.0",
    "Immutable published content version",
    contentVersionSchema,
  ),
  // Labs
  entry(
    "CapabilityDescriptor",
    "1.0.0",
    "Capability with execution class",
    capabilityDescriptorSchema,
  ),
  entry("LabSpec", "1.0.0", "Lab specification", labSpecSchema),
  entry(
    "LabProviderDescriptor",
    "1.0.0",
    "Provider descriptor",
    labProviderDescriptorSchema,
  ),
  entry("ProviderHealth", "1.0.0", "Provider health", providerHealthSchema),
  entry("ProvisionRequest", "1.0.0", "Provision request", provisionRequestSchema),
  entry("ProvisionResult", "1.0.0", "Provision result", provisionResultSchema),
  entry("ExecRequest", "1.0.0", "Command execution request", execRequestSchema),
  entry("ExecResult", "1.0.0", "Command execution result", execResultSchema),
  entry("DestroyRequest", "1.0.0", "Destroy request", destroyRequestSchema),
  entry("DestroyResult", "1.0.0", "Destroy result", destroyResultSchema),
  // Problems, faults, graders
  entry("CheckSpec", "1.0.0", "Deterministic check", checkSpecSchema),
  entry("FaultSpec", "1.0.0", "Fault module specification", faultSpecSchema),
  entry("GraderManifest", "1.0.0", "Grader manifest", graderManifestSchema),
  entry("GraderResult", "1.0.0", "Grader result", graderResultSchema),
  entry("ProblemSpec", "1.0.0", "Problem archetype", problemSpecSchema),
  entry("ProblemInstance", "1.0.0", "Seeded problem instance", problemInstanceSchema),
  // Attempts and mastery
  entry("Attempt", "1.0.0", "Attempt", attemptSchema),
  entry("AttemptResult", "1.0.0", "Attempt result", attemptResultSchema),
  entry("Evidence", "1.0.0", "Mastery evidence", evidenceSchema),
  entry("MasteryUpdate", "1.0.0", "Versioned mastery update", masteryUpdateSchema),
  // Careers
  entry("Competency", "1.0.0", "Competency", competencySchema),
  entry("RoleProfile", "1.0.0", "Role profile", roleProfileSchema),
  entry("CareerProfile", "1.0.0", "Learner career target", careerProfileSchema),
  entry(
    "ReadinessSnapshot",
    "1.0.0",
    "Readiness with confidence and gates",
    readinessSnapshotSchema,
  ),
  // Work orders and review
  entry("WorkOrder", "1.0.0", "Claude work order", workOrderSchema),
  entry("ReviewItem", "1.0.0", "Review queue item", reviewItemSchema),
  // Worker protocol
  entry("JobResult", "1.0.0", "Worker job result", jobResultSchema),
  entry("WorkerMessage", "1.0.0", "Worker protocol message", workerMessageSchema),
  entry("WorkerEnvelope", "1.0.0", "Worker protocol envelope", workerEnvelopeSchema),
];

export function contractById(id: string): ContractEntry {
  const found = CONTRACTS.find((contract) => contract.id === id);
  if (found === undefined) {
    throw new Error(`unknown contract: ${id}`);
  }
  return found;
}

export type ContractRegistry = z.core.$ZodRegistry<{
  id: string;
  version: string;
  description: string;
}>;

export function buildRegistry(): ContractRegistry {
  const registry = z.registry<{ id: string; version: string; description: string }>();
  for (const contract of CONTRACTS) {
    registry.add(contract.schema, {
      id: contract.id,
      version: contract.version,
      description: contract.description,
    });
  }
  return registry;
}

export const SCHEMA_FILE_SUFFIX = ".schema.json";

export function schemaFileName(id: string): string {
  return `${id}${SCHEMA_FILE_SUFFIX}`;
}

/** JSON Schema documents for every contract, keyed by id, with relative `$ref`s between them. */
export function generateJsonSchemas(): Record<string, Record<string, unknown>> {
  const registry = buildRegistry();
  const { schemas } = z.toJSONSchema(registry, {
    uri: (id) => schemaFileName(id),
    target: "draft-2020-12",
  });
  const output: Record<string, Record<string, unknown>> = {};
  for (const contract of CONTRACTS) {
    const generated = schemas[contract.id];
    if (generated === undefined) {
      throw new Error(`no JSON Schema generated for ${contract.id}`);
    }
    const { $schema, $id, ...rest } = generated as Record<string, unknown>;
    output[contract.id] = {
      $schema,
      $id,
      title: contract.id,
      description: contract.description,
      $comment: `HiveMind contract ${contract.id} v${contract.version}; generated from packages/schema, do not edit`,
      ...rest,
    };
  }
  return output;
}
