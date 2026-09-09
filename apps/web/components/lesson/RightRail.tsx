"use client";

import { useState } from "react";

import type { Lesson, SourceRecord } from "@hivemind/schema";

import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs } from "@/components/ui/Tabs";

/** Right rail: Lesson | Lab | Notes | Sources | Mastery; only Lesson and Sources are live in Stage 01. */
export function RightRail({
  lesson,
  sources,
}: {
  readonly lesson: Lesson;
  readonly sources: readonly SourceRecord[];
}) {
  const [active, setActive] = useState("lesson");
  const claimsBySource = new Map<string, number>();
  for (const claim of lesson.claims) {
    for (const sourceId of claim.source_ids) {
      claimsBySource.set(sourceId, (claimsBySource.get(sourceId) ?? 0) + 1);
    }
  }
  return (
    <Tabs
      tabs={[
        { id: "lesson", label: "Lesson" },
        { id: "lab", label: "Lab", disabled: "s04" },
        { id: "notes", label: "Notes", disabled: "s05" },
        { id: "sources", label: "Sources" },
        { id: "mastery", label: "Mastery", disabled: "s06" },
      ]}
      active={active}
      onChange={setActive}
    >
      {active === "lesson" ? (
        <div className="p-3 text-[12px]">
          <div className="hm-label mb-1">Objectives</div>
          <ul className="mb-3">
            {lesson.objectives.map((objective) => (
              <li key={objective.id} className="flex gap-2 py-0.5">
                <span className="text-dim">☐</span>
                <span>{objective.text}</span>
              </li>
            ))}
          </ul>
          <table className="w-full">
            <tbody className="hm-mono">
              <tr>
                <td className="py-0.5 text-muted">estimated</td>
                <td className="text-right">{lesson.estimated_minutes} min</td>
              </tr>
              <tr>
                <td className="py-0.5 text-muted">difficulty</td>
                <td className="text-right">{lesson.difficulty} / 5</td>
              </tr>
              <tr>
                <td className="py-0.5 text-muted">skills</td>
                <td className="text-right">{lesson.skill_ids.join(", ")}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-muted">prerequisites</td>
                <td className="text-right">
                  {lesson.prerequisite_lesson_ids.length === 0
                    ? "none"
                    : lesson.prerequisite_lesson_ids.join(", ")}
                </td>
              </tr>
            </tbody>
          </table>
          {lesson.labs.length > 0 ? (
            <>
              <div className="hm-label mt-3 mb-1">Related labs</div>
              <ul className="hm-mono">
                {lesson.labs.map((lab) => (
                  <li key={lab.problem_id} className="flex justify-between py-0.5">
                    <span>{lab.title}</span>
                    <span className="text-dim">{lab.mode} · s04</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
      {active === "sources" ? (
        <div className="p-3 text-[12px]">
          <div className="hm-label mb-1">References</div>
          <table className="hm-table">
            <thead>
              <tr>
                <th>source</th>
                <th>tier</th>
                <th className="num">claims</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>
                    {source.url !== undefined ? (
                      <a
                        href={source.url}
                        className="text-accent hover:underline"
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source.title}
                      </a>
                    ) : (
                      source.title
                    )}
                    {!source.ingested ? (
                      <span className="hm-mono ml-2 text-[10px] text-dim">
                        external · not ingested
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <StatusChip value={source.trust_tier} />
                  </td>
                  <td className="num">{claimsBySource.get(source.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hm-label mt-3 mb-1">Claims</div>
          <ol className="hm-mono">
            {lesson.claims.map((claim) => (
              <li
                key={claim.id}
                id={`claim-${claim.id}`}
                className="border-b border-border py-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-accent">[{claim.id}]</span>
                  <StatusChip value={claim.verification} />
                </div>
                <div className="font-sans text-text">{claim.statement}</div>
                <div className="text-[11px] text-dim">{claim.source_ids.join(", ")}</div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Tabs>
  );
}
