"use client";

import { useState } from "react";

import type { Question as QuestionRecord } from "@hivemind/schema";

/*
 * Prediction / knowledge-check widget. Learner view carries no `correct`
 * flags and no model answer (stripped by the content service), so committing
 * reveals the explanation only; grading lives in Stage 06.
 */
export function Question({ question }: { readonly question: QuestionRecord }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [committed, setCommitted] = useState(false);
  const canCommit =
    question.options === undefined ? text.trim().length > 0 : choice !== null;
  return (
    <div
      className="mb-3 border border-violet/40 bg-panel px-3 py-2"
      data-question={question.id}
    >
      <div className="hm-label mb-1">
        {question.kind} · {question.id} · difficulty {question.difficulty}
      </div>
      <p>{question.prompt}</p>
      {question.options === undefined ? (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={committed}
          rows={3}
          placeholder="write your prediction before revealing"
          className="hm-mono mb-2 w-full border border-border bg-bg p-2 text-[12px]"
        />
      ) : (
        <ul className="mb-2 list-none">
          {question.options.map((option) => (
            <li key={option.id}>
              <label className="flex cursor-pointer items-center gap-2 py-0.5">
                <input
                  type="radio"
                  name={question.id}
                  value={option.id}
                  disabled={committed}
                  checked={choice === option.id}
                  onChange={() => setChoice(option.id)}
                />
                <span className="hm-mono text-[11px] text-dim">{option.id}</span>
                <span>{option.text}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {committed ? (
        <div className="border-t border-border pt-2 text-[13px]">
          <span className="hm-label mr-2">explanation</span>
          {question.explanation}
        </div>
      ) : (
        <button
          type="button"
          disabled={!canCommit}
          onClick={() => setCommitted(true)}
          className="hm-mono rounded-sm border border-border px-2 py-0.5 text-[11px] text-text disabled:text-dim"
        >
          commit prediction
        </button>
      )}
    </div>
  );
}
