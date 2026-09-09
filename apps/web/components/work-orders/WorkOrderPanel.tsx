"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  WORK_ORDER_TEMPLATES,
  type WorkOrder,
  type WorkOrderTarget,
  type WorkOrderTemplate,
} from "@hivemind/schema";

import { ExecutionBadge } from "@/components/ui/ExecutionBadge";

/*
 * Work Order panel (14-work-orders.md, D-009): pick a template and target,
 * add instructions, create. The prompt is assembled deterministically on the
 * server; the only affordances are Copy for Claude and Export .md (§9).
 */

interface Props {
  readonly initialTemplate?: WorkOrderTemplate | undefined;
  readonly initialLesson?: string | undefined;
  /** Called with the new id after a successful create, or without one on cancel. */
  readonly onClose: (createdId?: string) => void;
}

const TARGET_KINDS: Record<WorkOrderTemplate, WorkOrderTarget["kind"]> = {
  "lesson.add": "module",
  "lesson.update": "lesson",
  "problem.create": "skill",
  "platform.feature": "platform",
};

export function WorkOrderPanel({ initialTemplate, initialLesson, onClose }: Props) {
  const router = useRouter();
  const [template, setTemplate] = useState<WorkOrderTemplate>(
    initialTemplate ??
      (initialLesson === undefined ? "platform.feature" : "lesson.update"),
  );
  const [targetValue, setTargetValue] = useState(initialLesson ?? "");
  const [secondary, setSecondary] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState<WorkOrder["priority"]>("normal");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kind = TARGET_KINDS[template];

  function buildTarget(): WorkOrderTarget | null {
    const value = targetValue.trim();
    if (value.length === 0) {
      return null;
    }
    switch (kind) {
      case "lesson":
        return { kind, lesson_id: value };
      case "module":
        return secondary.trim().length === 0
          ? null
          : { kind, course_id: value, module_id: secondary.trim() };
      case "skill":
        return { kind, skill_id: value };
      case "platform":
        return { kind, area: value };
      default:
        return null;
    }
  }

  async function create(): Promise<void> {
    const target = buildTarget();
    if (target === null) {
      setError("target is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          template,
          target,
          instructions,
          priority,
          ...(title.trim().length === 0 ? {} : { title: title.trim() }),
        }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string; detail?: string };
        setError(`${response.status} ${body.error ?? ""} ${body.detail ?? ""}`.trim());
        return;
      }
      const { order } = (await response.json()) as { order: WorkOrder };
      router.refresh();
      onClose(order.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex h-full flex-col border-l border-border bg-panel"
      data-testid="work-order-panel"
    >
      <header className="flex h-8 items-center justify-between border-b border-border px-3">
        <span className="hm-label">New work order</span>
        <span className="flex items-center gap-2">
          <ExecutionBadge mode="external" />
          <button
            type="button"
            onClick={() => onClose()}
            className="text-muted hover:text-text"
            aria-label="Close"
          >
            ×
          </button>
        </span>
      </header>
      <div className="flex flex-col gap-2 p-3 text-[12px]">
        <label className="flex flex-col gap-1">
          <span className="hm-label">template</span>
          <select
            value={template}
            onChange={(event) => setTemplate(event.target.value as WorkOrderTemplate)}
            className="hm-mono h-7 border border-border bg-bg px-2"
          >
            {WORK_ORDER_TEMPLATES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="hm-label">
            {kind === "module" ? "course id" : `${kind} id`}
          </span>
          <input
            value={targetValue}
            onChange={(event) => setTargetValue(event.target.value)}
            className="hm-mono h-7 border border-border bg-bg px-2"
            placeholder={
              kind === "lesson"
                ? "HM-LESSON-<course>-<nn>"
                : kind === "platform"
                  ? "area, e.g. settings"
                  : `${kind} id`
            }
          />
        </label>
        {kind === "module" ? (
          <label className="flex flex-col gap-1">
            <span className="hm-label">module id</span>
            <input
              value={secondary}
              onChange={(event) => setSecondary(event.target.value)}
              className="hm-mono h-7 border border-border bg-bg px-2"
              placeholder="<course>.<module>"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1">
          <span className="hm-label">title (optional)</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-7 border border-border bg-bg px-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="hm-label">instructions</span>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={6}
            className="border border-border bg-bg p-2"
            placeholder="What should Claude Code do? Included verbatim in the prompt."
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="hm-label">priority</span>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as WorkOrder["priority"])}
            className="hm-mono h-7 border border-border bg-bg px-2"
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
          </select>
        </label>
        {error !== null ? (
          <div className="hm-mono border border-danger/40 bg-danger/10 px-2 py-1 text-danger">
            {error}
          </div>
        ) : null}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            className="hm-mono rounded-sm border border-accent px-2 py-1 text-accent hover:bg-panel-2 disabled:text-dim"
          >
            create
          </button>
          <button
            type="button"
            onClick={() => onClose()}
            className="hm-mono rounded-sm border border-border px-2 py-1 text-muted hover:bg-panel-2"
          >
            cancel
          </button>
        </div>
        <p className="text-[11px] text-dim">
          The prompt is assembled deterministically from the template and target; nothing
          runs server-side (D-009).
        </p>
      </div>
    </div>
  );
}
