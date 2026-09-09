import type { BlockNode, InlineNode, Lesson } from "@hivemind/schema";

import { Question } from "./Question";

/*
 * Renders the compiled lesson tree (packages/schema lesson-body). Pure React
 * over data: no MDX, no eval, nothing learner-facing that names a fix
 * (UI-SYSTEM §10). Claim refs become superscript links into the Sources tab.
 */

const ELEMENT_LABEL: Record<string, string> = {
  motivation: "Motivation",
  mental_model: "Mental model",
  explanation: "Rigorous explanation",
  diagram: "Diagram",
  worked_example: "Worked example",
  misconception: "Common misconception",
  prediction: "Prediction",
  guided_exercise: "Guided exercise",
  demonstration: "Real demonstration",
  independent_problem: "Independent problem",
  reflection: "Reflection",
  mastery_evaluation: "Mastery evaluation",
};

export function Inline({ nodes }: { readonly nodes: readonly InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.kind) {
          case "text":
            return <span key={index}>{node.value}</span>;
          case "code":
            return <code key={index}>{node.value}</code>;
          case "kbd":
            return <kbd key={index}>{node.value}</kbd>;
          case "break":
            return <br key={index} />;
          case "strong":
            return (
              <strong key={index}>
                <Inline nodes={node.children} />
              </strong>
            );
          case "emphasis":
            return (
              <em key={index}>
                <Inline nodes={node.children} />
              </em>
            );
          case "link":
            return (
              <a
                key={index}
                href={node.href}
                className="text-accent underline"
                rel="noreferrer"
              >
                <Inline nodes={node.children} />
              </a>
            );
          case "claim_ref":
            return (
              <sup key={index}>
                <a href={`#claim-${node.claim_id}`} title={`claim ${node.claim_id}`}>
                  [{node.claim_id}]
                </a>
              </sup>
            );
        }
      })}
    </>
  );
}

const CALLOUT_CLASS: Record<string, string> = {
  note: "border-border",
  tip: "border-success/40",
  warning: "border-warning/40",
  misconception: "border-danger/40",
  prediction: "border-violet/40",
};

export function Block({
  node,
  lesson,
}: {
  readonly node: BlockNode;
  readonly lesson: Lesson;
}) {
  switch (node.kind) {
    case "heading":
      return node.level === 3 ? (
        <h3>
          <Inline nodes={node.children} />
        </h3>
      ) : (
        <h4>
          <Inline nodes={node.children} />
        </h4>
      );
    case "paragraph":
      return (
        <p>
          <Inline nodes={node.children} />
        </p>
      );
    case "list": {
      const items = node.items.map((item, index) => (
        <li key={index}>
          {item.map((child, position) => (
            <Block key={position} node={child} lesson={lesson} />
          ))}
        </li>
      ));
      return node.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case "code_block":
      return (
        <figure>
          <pre data-language={node.language}>
            <code>{node.code}</code>
          </pre>
          {node.caption !== undefined ? (
            <figcaption className="-mt-2 mb-3 text-[11px] text-muted">
              {node.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    case "table":
      return (
        <table>
          <thead>
            <tr>
              {node.header.map((cell, index) => (
                <th key={index}>
                  <Inline nodes={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {node.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>
                    <Inline nodes={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "callout":
      return (
        <aside
          className={`mb-3 border-l-2 bg-panel px-3 py-2 ${CALLOUT_CLASS[node.callout] ?? ""}`}
          data-callout={node.callout}
        >
          <div className="hm-label mb-1">{node.title ?? node.callout}</div>
          {node.children.map((child, index) => (
            <Block key={index} node={child} lesson={lesson} />
          ))}
        </aside>
      );
    case "diagram":
      return (
        <figure className="mb-3">
          <pre data-diagram={node.format} className="leading-tight">
            {node.source}
          </pre>
          <figcaption className="-mt-2 text-[11px] text-muted">
            {node.caption ?? ""}
            {node.format === "mermaid" ? (
              <span className="hm-mono ml-2 text-dim">
                mermaid source · renderer arrives with the Lab Workspace
              </span>
            ) : null}
          </figcaption>
        </figure>
      );
    case "question": {
      const question = lesson.questions.find(
        (candidate) => candidate.id === node.question_id,
      );
      return question === undefined ? (
        <p className="hm-mono text-danger">missing question {node.question_id}</p>
      ) : (
        <Question question={question} />
      );
    }
    case "exercise":
      return (
        <section
          className="mb-3 border border-border bg-panel px-3 py-2"
          data-exercise={node.exercise}
        >
          <div className="hm-label mb-1">
            {node.exercise} exercise · {node.title}
          </div>
          {node.children.map((child, index) => (
            <Block key={index} node={child} lesson={lesson} />
          ))}
        </section>
      );
    case "thematic_break":
      return <hr />;
  }
}

export function LessonBody({ lesson }: { readonly lesson: Lesson }) {
  return (
    <article className="hm-lesson">
      {lesson.sections.map((section, index) => (
        <section
          key={section.element}
          id={section.element}
          data-element={section.element}
        >
          <h2>
            <span className="mr-2 text-dim">{String(index + 1).padStart(2, "0")}</span>
            {section.heading}
            <span className="ml-2 text-[10px] font-normal tracking-normal text-dim normal-case">
              {ELEMENT_LABEL[section.element]}
            </span>
          </h2>
          {section.blocks.map((block, position) => (
            <Block key={position} node={block} lesson={lesson} />
          ))}
        </section>
      ))}
    </article>
  );
}
