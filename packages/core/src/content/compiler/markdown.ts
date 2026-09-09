import {
  LESSON_ELEMENTS,
  type BlockNode,
  type CalloutKind,
  type ExerciseKind,
  type InlineNode,
  type LessonElement,
  type LessonSection,
} from "@hivemind/schema";
import type { Content as MdastContent, PhrasingContent, Root } from "mdast";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { Diagnostics } from "./diagnostics";

/*
 * lesson.md → LessonSection[] (the render tree in packages/schema).
 *
 * Authoring rules (COURSE_AUTHORING.md):
 *   ## Heading {#element}         one section per RFP §110 element, in any order
 *   ### / ####                     sub-headings inside a section
 *   :::callout{kind=warning title="…"} … :::     callout container
 *   :::exercise{kind=guided title="…"} … :::     guided | demonstration | independent
 *   ::question{id=…}               placeholder resolved against questions.yaml
 *   :claim[id]                     provenance marker resolved against claims.yaml
 *   :kbd[Ctrl+K]                   keyboard chip
 *   ```ascii / ```mermaid          diagram; any other fence is a code block
 *   ---                            thematic break
 * HTML, images, footnotes, and H1 are rejected so the tree stays renderable
 * on Workers without eval.
 */

const ELEMENT_SET = new Set<string>(LESSON_ELEMENTS);
const HEADING_TAG = /\s*\{#([a-z_]+)\}\s*$/u;
const CALLOUT_KINDS = new Set(["note", "tip", "warning", "misconception", "prediction"]);
const EXERCISE_KINDS = new Set(["guided", "demonstration", "independent"]);

interface DirectiveNode {
  type: "containerDirective" | "leafDirective" | "textDirective";
  name: string;
  attributes?: Record<string, string | null | undefined> | null;
  children: MdastContent[];
}

export interface MarkdownResult {
  readonly sections: LessonSection[];
  readonly questionIds: string[];
  readonly claimIds: string[];
}

export function parseLessonMarkdown(
  markdown: string,
  path: string,
  diagnostics: Diagnostics,
): MarkdownResult {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkDirective)
    .parse(markdown) as Root;
  const sections: LessonSection[] = [];
  const questionIds: string[] = [];
  const claimIds: string[] = [];
  const seen = new Set<LessonElement>();
  // `element: null` keeps parsing a mis-tagged section so nested problems still surface.
  let current: {
    element: LessonElement | null;
    heading: string;
    blocks: BlockNode[];
  } | null = null;

  const context = { path, diagnostics, questionIds, claimIds };

  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 1) {
      diagnostics.error(
        path,
        "H1 headings are not allowed; the lesson title comes from metadata.yaml",
      );
      continue;
    }
    if (node.type === "heading" && node.depth === 2) {
      const text = plainText(node.children);
      const match = HEADING_TAG.exec(text);
      const tag = match?.[1];
      if (tag === undefined || !ELEMENT_SET.has(tag)) {
        diagnostics.error(
          path,
          `section "${text}" must end with {#<element>} where element is one of: ${LESSON_ELEMENTS.join(", ")}`,
        );
        current = { element: null, heading: text, blocks: [] };
        continue;
      }
      const element = tag as LessonElement;
      if (seen.has(element)) {
        diagnostics.error(path, `element ${element} appears twice`);
      }
      seen.add(element);
      const section = {
        element,
        heading: text.replace(HEADING_TAG, "").trim(),
        blocks: [] as BlockNode[],
      };
      sections.push(section);
      current = section;
      continue;
    }
    if (current === null) {
      diagnostics.error(path, "content before the first `## … {#element}` heading");
      continue;
    }
    const block = toBlock(node, context);
    if (block !== null) {
      current.blocks.push(block);
    }
  }
  return { sections, questionIds, claimIds };
}

interface Context {
  readonly path: string;
  readonly diagnostics: Diagnostics;
  readonly questionIds: string[];
  readonly claimIds: string[];
}

function toBlocks(nodes: readonly MdastContent[], context: Context): BlockNode[] {
  const blocks: BlockNode[] = [];
  for (const node of nodes) {
    const block = toBlock(node, context);
    if (block !== null) {
      blocks.push(block);
    }
  }
  return blocks;
}

function toBlock(node: MdastContent, context: Context): BlockNode | null {
  const { path, diagnostics } = context;
  switch (node.type) {
    case "heading": {
      if (node.depth !== 3 && node.depth !== 4) {
        diagnostics.error(
          path,
          `heading depth ${node.depth} is not allowed inside a section (use ### or ####)`,
        );
        return null;
      }
      return {
        kind: "heading",
        level: node.depth,
        children: toInlines(node.children, context),
      };
    }
    case "paragraph":
      return { kind: "paragraph", children: toInlines(node.children, context) };
    case "list":
      return {
        kind: "list",
        ordered: node.ordered === true,
        items: node.children.map((item) => toBlocks(item.children, context)),
      };
    case "code": {
      if (node.lang === "ascii" || node.lang === "mermaid") {
        return {
          kind: "diagram",
          format: node.lang,
          source: node.value,
          ...(node.meta ? { caption: node.meta } : {}),
        };
      }
      return {
        kind: "code_block",
        ...(node.lang ? { language: node.lang } : {}),
        code: node.value,
        ...(node.meta ? { caption: node.meta } : {}),
      };
    }
    case "table": {
      const [header, ...rows] = node.children;
      return {
        kind: "table",
        header:
          header === undefined
            ? []
            : header.children.map((cell) => toInlines(cell.children, context)),
        rows: rows.map((row) =>
          row.children.map((cell) => toInlines(cell.children, context)),
        ),
      };
    }
    case "thematicBreak":
      return { kind: "thematic_break" };
    case "blockquote":
      return {
        kind: "callout",
        callout: "note",
        children: toBlocks(node.children, context),
      };
    case "html":
      diagnostics.error(path, "raw HTML is not allowed in lessons");
      return null;
    case "image":
      diagnostics.error(
        path,
        "images are not supported in lessons yet; use an ascii or mermaid diagram",
      );
      return null;
    default:
      break;
  }
  const directive = node as unknown as DirectiveNode;
  if (directive.type === "containerDirective") {
    return containerDirective(directive, context);
  }
  if (directive.type === "leafDirective") {
    return leafDirective(directive, context);
  }
  diagnostics.error(path, `unsupported block node: ${node.type}`);
  return null;
}

function containerDirective(
  directive: DirectiveNode,
  context: Context,
): BlockNode | null {
  const attributes = directive.attributes ?? {};
  const kind = attributes["kind"] ?? "";
  const title = attributes["title"] ?? undefined;
  if (directive.name === "callout") {
    if (!CALLOUT_KINDS.has(kind)) {
      context.diagnostics.error(
        context.path,
        `callout kind "${kind}" must be one of note, tip, warning, misconception, prediction`,
      );
      return null;
    }
    return {
      kind: "callout",
      callout: kind as CalloutKind,
      ...(title === undefined ? {} : { title }),
      children: toBlocks(stripDirectiveLabel(directive.children), context),
    };
  }
  if (directive.name === "exercise") {
    if (!EXERCISE_KINDS.has(kind)) {
      context.diagnostics.error(
        context.path,
        `exercise kind "${kind}" must be guided, demonstration, or independent`,
      );
      return null;
    }
    if (title === undefined || title.length === 0) {
      context.diagnostics.error(
        context.path,
        "exercise directives need a title attribute",
      );
      return null;
    }
    return {
      kind: "exercise",
      exercise: kind as ExerciseKind,
      title,
      children: toBlocks(stripDirectiveLabel(directive.children), context),
    };
  }
  context.diagnostics.error(
    context.path,
    `unknown container directive :::${directive.name}`,
  );
  return null;
}

function leafDirective(directive: DirectiveNode, context: Context): BlockNode | null {
  if (directive.name === "question") {
    const id = directive.attributes?.["id"] ?? "";
    if (id.length === 0) {
      context.diagnostics.error(context.path, "::question needs an id attribute");
      return null;
    }
    context.questionIds.push(id);
    return { kind: "question", question_id: id };
  }
  context.diagnostics.error(context.path, `unknown leaf directive ::${directive.name}`);
  return null;
}

/** remark-directive marks a `[label]` paragraph with `directiveLabel`; it is not content. */
function stripDirectiveLabel(children: readonly MdastContent[]): MdastContent[] {
  return children.filter(
    (child) => !(child.data as { directiveLabel?: boolean } | undefined)?.directiveLabel,
  );
}

function toInlines(nodes: readonly PhrasingContent[], context: Context): InlineNode[] {
  const inlines: InlineNode[] = [];
  for (const node of nodes) {
    const inline = toInline(node, context);
    if (inline !== null) {
      inlines.push(inline);
    }
  }
  return inlines;
}

function toInline(node: PhrasingContent, context: Context): InlineNode | null {
  const { path, diagnostics } = context;
  switch (node.type) {
    case "text":
      return { kind: "text", value: node.value };
    case "inlineCode":
      return { kind: "code", value: node.value };
    case "strong":
      return { kind: "strong", children: toInlines(node.children, context) };
    case "emphasis":
      return { kind: "emphasis", children: toInlines(node.children, context) };
    case "link":
      return {
        kind: "link",
        href: node.url,
        children: toInlines(node.children, context),
      };
    case "break":
      return { kind: "break" };
    case "delete":
      return { kind: "emphasis", children: toInlines(node.children, context) };
    case "html":
      diagnostics.error(path, "inline HTML is not allowed in lessons");
      return null;
    case "image":
      diagnostics.error(path, "images are not supported in lessons yet");
      return null;
    case "footnoteReference":
      diagnostics.error(
        path,
        "footnotes are not supported; use :claim[id] for provenance",
      );
      return null;
    default:
      break;
  }
  const directive = node as unknown as DirectiveNode;
  if (directive.type === "textDirective") {
    const label = plainText(directive.children as PhrasingContent[]).trim();
    if (directive.name === "claim") {
      if (label.length === 0) {
        diagnostics.error(path, ":claim[] needs a claim id");
        return null;
      }
      context.claimIds.push(label);
      return { kind: "claim_ref", claim_id: label };
    }
    if (directive.name === "kbd") {
      return { kind: "kbd", value: label };
    }
    diagnostics.error(path, `unknown text directive :${directive.name}`);
    return null;
  }
  diagnostics.error(path, `unsupported inline node: ${node.type}`);
  return null;
}

export function plainText(nodes: readonly PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text" || node.type === "inlineCode") {
        return node.value;
      }
      if ("children" in node) {
        return plainText(node.children as PhrasingContent[]);
      }
      return "";
    })
    .join("");
}
