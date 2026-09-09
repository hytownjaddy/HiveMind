"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { WorkOrder, WorkOrderStatus } from "@hivemind/schema";

import { ExecutionBadge } from "@/components/ui/ExecutionBadge";
import { IdBadge } from "@/components/ui/IdBadge";
import { StatusChip } from "@/components/ui/StatusChip";
import { Tabs } from "@/components/ui/Tabs";

/*
 * Work-order detail (14-work-orders.md): overview, prompt, files, validation,
 * change report, history; actions copy for Claude, export .md, mark
 * implemented, approve, done. Validation runs come from the CLI.
 */

export function WorkOrderDetail({
  order,
  prompt,
  file,
}: {
  readonly order: WorkOrder;
  readonly prompt: string;
  readonly file: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState<string | null>(null);

  async function transition(to: WorkOrderStatus): Promise<void> {
    const response = await fetch(`/api/work-orders/${order.id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to }),
    });
    setMessage(
      response.ok ? `${order.id} → ${to}` : `transition failed (${response.status})`,
    );
    router.refresh();
  }

  async function exportFile(): Promise<void> {
    const response = await fetch(`/api/work-orders/${order.id}/export`, {
      method: "POST",
    });
    if (!response.ok) {
      setMessage(`export failed (${response.status})`);
      return;
    }
    const { file: text } = (await response.json()) as { file: string };
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${order.id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(
      `exported ${order.id}.md · also: bun run hivemind -- work pull ${order.id}`,
    );
    router.refresh();
  }

  async function copyPrompt(): Promise<void> {
    await navigator.clipboard.writeText(prompt);
    setMessage("prompt copied");
  }

  const targetLabel = Object.entries(order.target)
    .filter(([key]) => key !== "kind")
    .map(([, value]) => String(value))
    .join(" / ");

  return (
    <div className="flex h-full flex-col" data-testid="work-order-detail">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <IdBadge id={order.id} />
        <StatusChip kind="work_order" value={order.status} />
        <ExecutionBadge mode={order.execution} />
        <span className="hm-mono text-[11px] text-muted">{order.priority}</span>
        <span className="flex-1 truncate text-[12px]">{order.title}</span>
      </header>
      <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2 text-[11px]">
        <button
          type="button"
          onClick={() => void copyPrompt()}
          className="hm-mono rounded-sm border border-border px-2 py-0.5 hover:bg-panel-2"
        >
          copy for Claude <kbd className="text-dim">c</kbd>
        </button>
        <button
          type="button"
          onClick={() => void exportFile()}
          className="hm-mono rounded-sm border border-border px-2 py-0.5 hover:bg-panel-2"
        >
          export .md <kbd className="text-dim">e</kbd>
        </button>
        {order.status === "exported" ? (
          <button
            type="button"
            onClick={() => void transition("in_progress")}
            className="hm-mono rounded-sm border border-border px-2 py-0.5 hover:bg-panel-2"
          >
            mark in progress
          </button>
        ) : null}
        {order.status === "in_progress" ? (
          <button
            type="button"
            onClick={() => void transition("implemented")}
            className="hm-mono rounded-sm border border-border px-2 py-0.5 hover:bg-panel-2"
          >
            mark implemented
          </button>
        ) : null}
        <span
          className="hm-mono rounded-sm border border-border px-2 py-0.5 text-dim"
          title="Runs from the CLI: bun run hivemind -- work validate <id>"
        >
          validate <kbd>v</kbd> · CLI
        </span>
        {order.status === "review_required" ? (
          <button
            type="button"
            onClick={() => void transition("approved")}
            className="hm-mono rounded-sm border border-success/40 px-2 py-0.5 text-success hover:bg-panel-2"
          >
            approve
          </button>
        ) : null}
        {order.status === "approved" ? (
          <button
            type="button"
            onClick={() => void transition("done")}
            className="hm-mono rounded-sm border border-border px-2 py-0.5 hover:bg-panel-2"
          >
            mark done
          </button>
        ) : null}
        {message !== null ? <span className="hm-mono text-muted">{message}</span> : null}
      </div>
      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "prompt", label: "Prompt" },
          { id: "files", label: "Files" },
          { id: "validation", label: "Validation" },
          { id: "report", label: "Change Report" },
          { id: "history", label: "History" },
        ]}
        active={tab}
        onChange={setTab}
      >
        <div className="min-h-0 flex-1 overflow-auto p-3 text-[12px]">
          {tab === "overview" ? (
            <table className="w-full">
              <tbody className="hm-mono">
                {[
                  ["template", order.template],
                  ["target", `${order.target.kind} · ${targetLabel}`],
                  ["requested by", order.requested_by],
                  ["created", order.created_at],
                  ["updated", order.updated_at],
                  ["labels", order.labels.join(", ") || "—"],
                  ["dependencies", order.dependencies.join(", ") || "—"],
                  ["effort", order.effort ?? "—"],
                  ["repository paths", order.context.repository_paths.join("\n")],
                ].map(([key, value]) => (
                  <tr key={key}>
                    <td className="w-40 py-0.5 align-top text-muted">{key}</td>
                    <td className="py-0.5 whitespace-pre-wrap">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {tab === "prompt" ? (
            <pre className="hm-mono text-[12px] whitespace-pre-wrap">{prompt}</pre>
          ) : null}
          {tab === "files" ? (
            <div>
              <div className="hm-label mb-1">Exported file</div>
              <pre className="hm-mono max-h-96 overflow-auto border border-border bg-bg p-2 text-[11px]">
                {file}
              </pre>
              <div className="hm-label mt-3 mb-1">Files changed</div>
              <ul className="hm-mono">
                {(order.change_report?.files_changed ?? []).map((path) => (
                  <li key={path}>{path}</li>
                ))}
                {order.change_report === undefined ? (
                  <li className="text-dim">none yet</li>
                ) : null}
              </ul>
            </div>
          ) : null}
          {tab === "validation" ? (
            <div>
              <div className="hm-label mb-1">Validation commands</div>
              <ul className="hm-mono mb-3">
                {order.context.validation_commands.map((command) => (
                  <li key={command}>$ {command}</li>
                ))}
              </ul>
              <div className="hm-label mb-1">Runs</div>
              {order.validation_runs.length === 0 ? (
                <div className="hm-mono text-dim">
                  no runs · bun run hivemind -- work validate {order.id}
                </div>
              ) : (
                <table className="hm-table">
                  <thead>
                    <tr>
                      <th>at</th>
                      <th>command</th>
                      <th className="num">exit</th>
                      <th>summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.validation_runs.map((run) => (
                      <tr key={`${run.at}-${run.command}`}>
                        <td className="hm-mono">{run.at}</td>
                        <td className="hm-mono">{run.command}</td>
                        <td
                          className={`num ${run.exit_code === 0 ? "text-success" : "text-danger"}`}
                        >
                          {run.exit_code}
                        </td>
                        <td className="whitespace-normal">{run.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
          {tab === "report" ? (
            order.change_report === undefined ? (
              <div className="hm-mono text-dim">
                no change report · bun run hivemind -- work complete {order.id} --summary
                &quot;…&quot;
              </div>
            ) : (
              <div>
                <div className="hm-mono text-muted">
                  {order.change_report.written_at}
                  {order.change_report.commit !== undefined
                    ? ` · ${order.change_report.commit}`
                    : ""}
                </div>
                <p className="mt-2 whitespace-pre-wrap">{order.change_report.summary}</p>
              </div>
            )
          ) : null}
          {tab === "history" ? (
            <table className="hm-table">
              <thead>
                <tr>
                  <th>at</th>
                  <th>from</th>
                  <th>to</th>
                  <th>by</th>
                  <th>note</th>
                </tr>
              </thead>
              <tbody>
                {order.history.map((entry, index) => (
                  <tr key={`${entry.at}-${index}`}>
                    <td className="hm-mono">{entry.at}</td>
                    <td>
                      {entry.from === null ? (
                        "—"
                      ) : (
                        <StatusChip kind="work_order" value={entry.from} />
                      )}
                    </td>
                    <td>
                      <StatusChip kind="work_order" value={entry.to} />
                    </td>
                    <td className="hm-mono">{entry.by}</td>
                    <td className="whitespace-normal text-muted">{entry.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </Tabs>
    </div>
  );
}
