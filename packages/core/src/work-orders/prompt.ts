import type { WorkOrder } from "@hivemind/schema";

/*
 * Deterministic prompt assembly (D-009). The prompt is a pure function of the
 * work order: same order, same bytes. It is what "Copy for Claude" copies and
 * what the exported file carries below its YAML header. Prompts stay short
 * because the repository carries the rules (COURSE_AUTHORING.md).
 */

function section(title: string, lines: readonly string[]): string {
  if (lines.length === 0) {
    return "";
  }
  return `## ${title}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n\n`;
}

function describeTarget(order: WorkOrder): string {
  const target = order.target;
  switch (target.kind) {
    case "lesson":
      return `lesson \`${target.lesson_id}\``;
    case "module":
      return `module \`${target.module_id}\` of course \`${target.course_id}\``;
    case "course":
      return `course \`${target.course_id}\``;
    case "skill":
      return `skill \`${target.skill_id}\``;
    case "problem":
      return `problem \`${target.problem_id}\``;
    case "platform":
      return `platform area \`${target.area}\``;
  }
}

export function assemblePrompt(order: WorkOrder): string {
  const header =
    `Execute HiveMind Work Order ${order.id}.\n` +
    `Follow CLAUDE.md, COURSE_AUTHORING.md, LAB_AUTHORING.md, and the referenced schemas. ` +
    `Execution mode: ${order.execution} (no server-side agent; you are the executor).\n\n`;
  const task =
    `## Task\n\n` +
    `- Title: ${order.title}\n` +
    `- Template: \`${order.template}\`\n` +
    `- Target: ${describeTarget(order)}\n` +
    `- Priority: ${order.priority}\n` +
    (order.dependencies.length > 0
      ? `- Depends on: ${order.dependencies.join(", ")}\n`
      : "") +
    `\n`;
  const instructions =
    order.instructions.trim().length > 0
      ? `## Instructions\n\n${order.instructions.trim()}\n\n`
      : "";
  const body =
    section("Repository paths", order.context.repository_paths) +
    section("Schemas", order.context.schemas) +
    section("Acceptance criteria", order.context.acceptance_criteria) +
    section(
      "Validation commands",
      order.context.validation_commands.map((command) => `\`${command}\``),
    ) +
    section("Expected output", order.context.expected_output) +
    section("Source requirements", order.context.source_requirements);
  const closing =
    `## When done\n\n` +
    `- Run every validation command; do not weaken an acceptance criterion to pass (invariant 13).\n` +
    `- Do not publish content; approval and publishing stay with Jacob (invariant 10).\n` +
    `- Record the change report: \`bun run hivemind -- work complete ${order.id} --summary "<what changed>"\`.\n`;
  return header + task + instructions + body + closing;
}
