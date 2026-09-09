import type {
  WorkOrderContext,
  WorkOrderTarget,
  WorkOrderTemplate,
} from "@hivemind/schema";

/*
 * Work-order templates v1 (D-009, Stage 01). A template turns a target plus
 * Jacob's instructions into a deterministic context: repository paths,
 * schemas, acceptance criteria, validation commands, expected output, and
 * source requirements. Stage 05 grows the catalogue.
 */

export interface TemplateInput {
  readonly target: WorkOrderTarget;
  /** Repository path of the target when known (lesson/module/course source directory). */
  readonly targetPath?: string | undefined;
}

export interface TemplateDefinition {
  readonly template: WorkOrderTemplate;
  readonly title: (input: TemplateInput) => string;
  readonly context: (input: TemplateInput) => WorkOrderContext;
  readonly targetKinds: readonly WorkOrderTarget["kind"][];
}

const CONTENT_VALIDATION = [
  "bun run hivemind -- content compile content/",
  "bun run verify",
];
const CONTENT_SOURCE_RULES = [
  "Cite only sources recorded under content/sources (D-011); add a source record before citing it.",
  "Paid books and courses are notes-only: never reproduce their text (invariant 11).",
  "Every factual claim gets an entry in claims.yaml with at least one source id.",
];

function targetLabel(target: WorkOrderTarget): string {
  switch (target.kind) {
    case "lesson":
      return target.lesson_id;
    case "module":
      return `${target.course_id} / ${target.module_id}`;
    case "course":
      return target.course_id;
    case "skill":
      return target.skill_id;
    case "problem":
      return target.problem_id;
    case "platform":
      return target.area;
  }
}

function lessonPaths(input: TemplateInput): string[] {
  return input.targetPath === undefined
    ? ["content/courses/<domain>/<course>/modules/<nn>-<module>/lessons/<nn>-<lesson>/"]
    : [input.targetPath];
}

export const TEMPLATES: Readonly<Record<WorkOrderTemplate, TemplateDefinition>> = {
  "lesson.add": {
    template: "lesson.add",
    targetKinds: ["module"],
    title: (input) => `Add a lesson to ${targetLabel(input.target)}`,
    context: (input) => ({
      repository_paths: [
        ...(input.targetPath === undefined
          ? ["content/courses/<domain>/<course>/modules/<nn>-<module>/"]
          : [input.targetPath]),
        "content/skills/",
        "content/sources/",
      ],
      schemas: [
        "schemas/Lesson.schema.json",
        "schemas/Question.schema.json",
        "schemas/Claim.schema.json",
        "schemas/Module.schema.json",
      ],
      acceptance_criteria: [
        "A new lesson directory with lesson.md, metadata.yaml, questions.yaml, and claims.yaml exists under the module.",
        "The lesson has all twelve RFP §110 sections, each `##` heading tagged with its element id.",
        "The module's module.yaml lists the new lesson id in order.",
        "`hivemind content compile content/` passes with no errors; the lesson's qa_state is draft.",
      ],
      validation_commands: CONTENT_VALIDATION,
      expected_output: [
        "New lesson files",
        "Updated module.yaml",
        "A change report via `hivemind work complete`",
      ],
      source_requirements: CONTENT_SOURCE_RULES,
    }),
  },
  "lesson.update": {
    template: "lesson.update",
    targetKinds: ["lesson"],
    title: (input) => `Update lesson ${targetLabel(input.target)}`,
    context: (input) => ({
      repository_paths: [...lessonPaths(input), "content/sources/"],
      schemas: [
        "schemas/Lesson.schema.json",
        "schemas/Question.schema.json",
        "schemas/Claim.schema.json",
      ],
      acceptance_criteria: [
        "The requested change is made in lesson.md and, where needed, questions.yaml and claims.yaml.",
        "metadata.yaml bumps the lesson version and resets qa_state to draft (invariants 6, 10).",
        "All twelve RFP §110 sections remain present and tagged.",
        "`hivemind content compile content/` passes with no errors.",
      ],
      validation_commands: CONTENT_VALIDATION,
      expected_output: [
        "Updated lesson files with a version bump",
        "A change report via `hivemind work complete`",
      ],
      source_requirements: CONTENT_SOURCE_RULES,
    }),
  },
  "problem.create": {
    template: "problem.create",
    targetKinds: ["skill", "problem", "course"],
    title: (input) => `Create a problem archetype for ${targetLabel(input.target)}`,
    context: (input) => ({
      repository_paths: [
        "content/problems/",
        "content/topologies/",
        ...(input.targetPath === undefined ? [] : [input.targetPath]),
      ],
      schemas: [
        "schemas/ProblemSpec.schema.json",
        "schemas/LabSpec.schema.json",
        "schemas/FaultSpec.schema.json",
        "schemas/GraderManifest.schema.json",
      ],
      acceptance_criteria: [
        "Placeholder (Stage 03): the archetype, fault, grader, and reference solution are authored per LAB_AUTHORING.md.",
        "The RFP §46 validation pipeline passes on the worker before the problem is approved.",
      ],
      validation_commands: ["bun run hivemind -- work validate <id>"],
      expected_output: ["Problem archetype files (Stage 03 defines the layout)"],
      source_requirements: CONTENT_SOURCE_RULES,
    }),
  },
  "platform.feature": {
    template: "platform.feature",
    targetKinds: ["platform"],
    title: (input) => `Platform: ${targetLabel(input.target)}`,
    context: (input) => ({
      repository_paths: [
        input.targetPath ?? "apps/ packages/ services/ (as the instructions name)",
      ],
      schemas: ["packages/schema/src/ (bump versions on contract changes)"],
      acceptance_criteria: [
        "The change follows DECISIONS.md, ARCHITECTURE.md, and the 17 invariants in AGENTS.md.",
        "No business logic in route handlers or Durable Object fetch handlers (D-031).",
        "`bun run verify` and `bun run verify:py` pass.",
      ],
      validation_commands: ["bun run verify", "bun run verify:py"],
      expected_output: [
        "One coherent commit per task (D-025)",
        "A change report via `hivemind work complete`",
      ],
      source_requirements: [],
    }),
  },
};

export function templateFor(template: WorkOrderTemplate): TemplateDefinition {
  return TEMPLATES[template];
}
