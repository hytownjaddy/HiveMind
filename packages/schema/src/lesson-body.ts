import { z } from "zod";

import { lessonElementSchema, type LessonElement } from "./common/enums";
import { slugSchema } from "./common/primitives";

/*
 * Lesson render tree. `lesson.md` (CommonMark + GFM + a fixed directive set) is
 * compiled by `hivemind content compile` into this tree; the web app renders it
 * with React components. No JSX or code evaluation happens at render time, so
 * lessons render on Workers without eval and questions stay structured data.
 */

export interface InlineText {
  readonly kind: "text";
  readonly value: string;
}
export interface InlineCode {
  readonly kind: "code";
  readonly value: string;
}
export interface InlineKbd {
  readonly kind: "kbd";
  readonly value: string;
}
export interface InlineBreak {
  readonly kind: "break";
}
/** Superscript provenance marker resolved against `Lesson.claims` (04-course-workspace). */
export interface InlineClaimRef {
  readonly kind: "claim_ref";
  readonly claim_id: string;
}
export interface InlineStrong {
  readonly kind: "strong";
  readonly children: readonly InlineNode[];
}
export interface InlineEmphasis {
  readonly kind: "emphasis";
  readonly children: readonly InlineNode[];
}
export interface InlineLink {
  readonly kind: "link";
  readonly href: string;
  readonly children: readonly InlineNode[];
}
export type InlineNode =
  | InlineText
  | InlineCode
  | InlineKbd
  | InlineBreak
  | InlineClaimRef
  | InlineStrong
  | InlineEmphasis
  | InlineLink;

export const inlineNodeSchema: z.ZodType<InlineNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("text"), value: z.string() }),
    z.strictObject({ kind: z.literal("code"), value: z.string() }),
    z.strictObject({ kind: z.literal("kbd"), value: z.string() }),
    z.strictObject({ kind: z.literal("break") }),
    z.strictObject({ kind: z.literal("claim_ref"), claim_id: slugSchema }),
    z.strictObject({ kind: z.literal("strong"), children: z.array(inlineNodeSchema) }),
    z.strictObject({ kind: z.literal("emphasis"), children: z.array(inlineNodeSchema) }),
    z.strictObject({
      kind: z.literal("link"),
      href: z.string().min(1),
      children: z.array(inlineNodeSchema),
    }),
  ]),
);

export const calloutKindSchema = z.enum([
  "note",
  "tip",
  "warning",
  "misconception",
  "prediction",
]);
export type CalloutKind = z.infer<typeof calloutKindSchema>;

export const diagramFormatSchema = z.enum(["ascii", "mermaid"]);
export type DiagramFormat = z.infer<typeof diagramFormatSchema>;

export const exerciseKindSchema = z.enum(["guided", "demonstration", "independent"]);
export type ExerciseKind = z.infer<typeof exerciseKindSchema>;

export interface BlockHeading {
  readonly kind: "heading";
  readonly level: 3 | 4;
  readonly children: readonly InlineNode[];
}
export interface BlockParagraph {
  readonly kind: "paragraph";
  readonly children: readonly InlineNode[];
}
export interface BlockList {
  readonly kind: "list";
  readonly ordered: boolean;
  readonly items: readonly (readonly BlockNode[])[];
}
export interface BlockCode {
  readonly kind: "code_block";
  readonly language?: string | undefined;
  readonly code: string;
  readonly caption?: string | undefined;
}
export interface BlockTable {
  readonly kind: "table";
  readonly header: readonly (readonly InlineNode[])[];
  readonly rows: readonly (readonly (readonly InlineNode[])[])[];
}
export interface BlockCallout {
  readonly kind: "callout";
  readonly callout: z.infer<typeof calloutKindSchema>;
  readonly title?: string | undefined;
  readonly children: readonly BlockNode[];
}
export interface BlockDiagram {
  readonly kind: "diagram";
  readonly format: z.infer<typeof diagramFormatSchema>;
  readonly source: string;
  readonly caption?: string | undefined;
}
/** Placeholder resolved against `Lesson.questions`; answers never live in the body. */
export interface BlockQuestion {
  readonly kind: "question";
  readonly question_id: string;
}
export interface BlockExercise {
  readonly kind: "exercise";
  readonly exercise: z.infer<typeof exerciseKindSchema>;
  readonly title: string;
  readonly children: readonly BlockNode[];
}
export interface BlockThematicBreak {
  readonly kind: "thematic_break";
}
export type BlockNode =
  | BlockHeading
  | BlockParagraph
  | BlockList
  | BlockCode
  | BlockTable
  | BlockCallout
  | BlockDiagram
  | BlockQuestion
  | BlockExercise
  | BlockThematicBreak;

export const blockNodeSchema: z.ZodType<BlockNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("heading"),
      level: z.union([z.literal(3), z.literal(4)]),
      children: z.array(inlineNodeSchema),
    }),
    z.strictObject({ kind: z.literal("paragraph"), children: z.array(inlineNodeSchema) }),
    z.strictObject({
      kind: z.literal("list"),
      ordered: z.boolean(),
      items: z.array(z.array(blockNodeSchema)),
    }),
    z.strictObject({
      kind: z.literal("code_block"),
      language: z.string().min(1).optional(),
      code: z.string(),
      caption: z.string().optional(),
    }),
    z.strictObject({
      kind: z.literal("table"),
      header: z.array(z.array(inlineNodeSchema)),
      rows: z.array(z.array(z.array(inlineNodeSchema))),
    }),
    z.strictObject({
      kind: z.literal("callout"),
      callout: calloutKindSchema,
      title: z.string().optional(),
      children: z.array(blockNodeSchema),
    }),
    z.strictObject({
      kind: z.literal("diagram"),
      format: diagramFormatSchema,
      source: z.string().min(1),
      caption: z.string().optional(),
    }),
    z.strictObject({ kind: z.literal("question"), question_id: slugSchema }),
    z.strictObject({
      kind: z.literal("exercise"),
      exercise: exerciseKindSchema,
      title: z.string().min(1),
      children: z.array(blockNodeSchema),
    }),
    z.strictObject({ kind: z.literal("thematic_break") }),
  ]),
);

/** One `##` section of a lesson, tagged with the RFP §110 element it fulfils. */
export interface LessonSection {
  readonly element: LessonElement;
  readonly heading: string;
  readonly blocks: readonly BlockNode[];
}

export const lessonSectionSchema: z.ZodType<LessonSection> = z.strictObject({
  element: lessonElementSchema,
  heading: z.string().min(1).max(200),
  blocks: z.array(blockNodeSchema),
});
