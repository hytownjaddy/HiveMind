import { workOrderSchema, type WorkOrder } from "@hivemind/schema";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { assemblePrompt } from "./prompt";

/*
 * `.hivemind/work-orders/<id>.md`: a YAML header holding the WorkOrder record
 * followed by the assembled prompt. The header is authoritative; `hivemind work
 * validate` re-assembles the prompt and reports any hand edits.
 */

export const WORK_ORDER_DIR = ".hivemind/work-orders";

export function workOrderFileName(id: string): string {
  return `${id}.md`;
}

export function serializeWorkOrderFile(order: WorkOrder): string {
  const parsed = workOrderSchema.parse(order);
  const header = stringifyYaml(parsed, { lineWidth: 0, sortMapEntries: false }).trimEnd();
  return `---\n${header}\n---\n\n${assemblePrompt(parsed)}`;
}

export interface ParsedWorkOrderFile {
  readonly order: WorkOrder;
  readonly prompt: string;
}

export type ParseFailure = { readonly ok: false; readonly error: string };

export function parseWorkOrderFile(
  text: string,
): { readonly ok: true; readonly file: ParsedWorkOrderFile } | ParseFailure {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(text);
  if (match === null) {
    return { ok: false, error: "missing YAML header delimited by ---" };
  }
  let header: unknown;
  try {
    header = parseYaml(match[1] ?? "");
  } catch (error) {
    return {
      ok: false,
      error: `invalid YAML header: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const parsed = workOrderSchema.safeParse(header);
  if (!parsed.success) {
    return {
      ok: false,
      error: `header does not match WorkOrder: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
    };
  }
  return { ok: true, file: { order: parsed.data, prompt: (match[2] ?? "").trim() } };
}

/** Problems that make a file unusable by Claude Code from the file alone. */
export function validateWorkOrderFile(file: ParsedWorkOrderFile): string[] {
  const problems: string[] = [];
  const expected = assemblePrompt(file.order).trim();
  if (file.prompt !== expected) {
    problems.push(
      "prompt body differs from the deterministic assembly; regenerate with `hivemind work pull` or edit the header instead",
    );
  }
  if (file.order.context.acceptance_criteria.length === 0) {
    problems.push("no acceptance criteria");
  }
  if (file.order.context.validation_commands.length === 0) {
    problems.push("no validation commands");
  }
  return problems;
}
