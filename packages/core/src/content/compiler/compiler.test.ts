import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { contentBundleSchema } from "@hivemind/schema";
import { describe, expect, it } from "vitest";

import { compileContent, diffBundles, formatDiff, summarizeBundle } from "./index";

const HERE = dirname(fileURLToPath(import.meta.url));
const VALID = join(HERE, "__fixtures__", "valid");
const INVALID = join(HERE, "__fixtures__", "invalid");
const AT = "2026-09-09T12:00:00Z";

describe("compileContent", () => {
  it("compiles a valid tree into a bundle that satisfies the contract", async () => {
    const result = await compileContent({
      root: VALID,
      generatedAt: AT,
      gitCommit: "abcdef1",
    });
    expect(result.diagnostics.errors).toEqual([]);
    const bundle = contentBundleSchema.parse(result.bundle);
    expect(bundle.courses.map((course) => course.id)).toEqual(["demo-course"]);
    expect(bundle.courses[0]?.uses_labs).toBe(true);
    expect(bundle.courses[0]?.module_ids).toEqual(["demo-course.basics"]);
    expect(bundle.courses[0]?.source_path).toBe("content/courses/linux/demo-course");
    expect(bundle.modules[0]?.lesson_ids).toEqual([
      "HM-LESSON-demo-course-01",
      "HM-LESSON-demo-course-02",
    ]);
    expect(bundle.modules[0]?.skill_ids).toEqual(["linux.networking.routing_table"]);
    const first = bundle.lessons[0];
    expect(first?.order).toBe(1);
    expect(first?.source_ids).toEqual(["src.iproute2.ip-route"]);
    expect(first?.sections.map((section) => section.element)).toEqual([
      "motivation",
      "mental_model",
      "explanation",
      "diagram",
      "worked_example",
      "misconception",
      "prediction",
      "guided_exercise",
      "demonstration",
      "independent_problem",
      "reflection",
      "mastery_evaluation",
    ]);
    expect(first?.sections[0]?.blocks).toEqual([
      {
        kind: "paragraph",
        children: [
          { kind: "text", value: "Every packet consults the routing table" },
          { kind: "claim_ref", claim_id: "lpm" },
          { kind: "text", value: ". Press " },
          { kind: "kbd", value: "Ctrl+K" },
          { kind: "text", value: " to search." },
        ],
      },
      {
        kind: "callout",
        callout: "note",
        title: "Scope",
        children: [
          { kind: "paragraph", children: [{ kind: "text", value: "IPv4 only." }] },
        ],
      },
    ]);
    expect(first?.sections[3]?.blocks[0]).toEqual({
      kind: "diagram",
      format: "ascii",
      source: "host --- gw --- internet",
    });
    expect(first?.sections[2]?.blocks[1]).toMatchObject({
      kind: "table",
      header: [[{ kind: "text", value: "prefix" }], [{ kind: "text", value: "via" }]],
    });
    expect(first?.sections[6]?.blocks[0]).toEqual({
      kind: "question",
      question_id: "predict-default",
    });
    expect(first?.sections[7]?.blocks[0]).toMatchObject({
      kind: "exercise",
      exercise: "guided",
      title: "Add a static route",
    });
    expect(first?.sections[10]?.blocks.at(-1)).toEqual({ kind: "thematic_break" });
    expect(first?.questions[0]?.lesson_id).toBe("HM-LESSON-demo-course-01");
    expect(result.diagnostics.items.map((item) => item.message)).toContain(
      "missing RFP §110 elements: mental_model, explanation, diagram, worked_example, misconception, prediction, guided_exercise, demonstration, independent_problem, reflection, mastery_evaluation",
    );
  });

  it("is deterministic and hashes independently of generation time", async () => {
    const a = await compileContent({ root: VALID, generatedAt: AT });
    const b = await compileContent({
      root: VALID,
      generatedAt: "2026-09-10T00:00:00Z",
      gitCommit: "1234567",
    });
    expect(a.bundle?.content_hash).toBe(b.bundle?.content_hash);
    expect(a.bundle?.lessons).toEqual(b.bundle?.lessons);
  });

  it("reports every problem in an invalid tree and produces no bundle", async () => {
    const result = await compileContent({ root: INVALID, generatedAt: AT });
    expect(result.bundle).toBeNull();
    const messages = result.diagnostics.errors.map(
      (item) => `${item.path}: ${item.message}`,
    );
    const expectContains = (fragment: string): void => {
      expect(
        messages.some((message) => message.includes(fragment)),
        `expected an error containing "${fragment}" in:\n${messages.join("\n")}`,
      ).toBe(true);
    };
    expectContains("H1 headings are not allowed");
    expectContains('section "Why routes matter" must end with {#<element>}');
    expectContains(":claim[nope] has no entry in claims.yaml");
    expectContains("::question{id=missing} has no entry in questions.yaml");
    expectContains('callout kind "shout"');
    expectContains("unknown skill linux.networking.unknown");
    expectContains("cites unknown source src.nope");
    expectContains("requires review.approved_by");
    expectContains("missing RFP §110 elements");
  });
});

describe("diffBundles", () => {
  it("classifies additions, removals, bumps, and unbumped body changes", async () => {
    const compiled = await compileContent({ root: VALID, generatedAt: AT });
    const next = summarizeBundle(compiled.bundle!, null);
    expect(diffBundles(null, next).added).toEqual([
      "HM-LESSON-demo-course-01",
      "HM-LESSON-demo-course-02",
    ]);
    const previous = {
      content_version_id: "HM-CV-0001",
      courses: [{ id: "demo-course", version: "0.1.0" }],
      lessons: [
        {
          id: "HM-LESSON-demo-course-01",
          version: "0.1.0",
          body_hash: "0".repeat(64),
          qa_state: "draft",
        },
        {
          id: "HM-LESSON-demo-course-03",
          version: "0.1.0",
          body_hash: "0".repeat(64),
          qa_state: "draft",
        },
      ],
    };
    const diff = diffBundles(previous, next);
    expect(diff.added).toEqual(["HM-LESSON-demo-course-02"]);
    expect(diff.removed).toEqual(["HM-LESSON-demo-course-03"]);
    expect(diff.unbumped).toEqual(["HM-LESSON-demo-course-01"]);
    expect(diff.courses).toEqual([]);
    expect(formatDiff(diff)).toContain(
      "! HM-LESSON-demo-course-01: body changed without a version bump",
    );
    expect(diffBundles(next, next).identical).toBe(true);
    expect(formatDiff(diffBundles(next, next))).toBe("no content changes");
  });
});
