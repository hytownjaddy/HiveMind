import Link from "next/link";

import { Pane, EmptyRow } from "@/components/ui/Pane";
import { IdBadge } from "@/components/ui/IdBadge";
import { StatusChip } from "@/components/ui/StatusChip";
import { ExecutionBadge } from "@/components/ui/ExecutionBadge";
import { WorkspaceTitle } from "@/components/ui/WorkspaceTitle";
import { currentPrincipal } from "@/lib/server/auth";
import { services } from "@/lib/server/services";

export const dynamic = "force-dynamic";

function age(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

/*
 * 01-control-center.md: what is running, what is due, what Claude work is
 * pending, the one next action. Every pane is a real table over services;
 * Stage 05–06 light up target, work queue, and reviews.
 */
export default async function ControlCenterPage() {
  const [principal, svc] = await Promise.all([currentPrincipal(), services()]);
  const learnerId = principal?.learner.id ?? "HM-LRN-000001";
  const [report, counts, recentOrders, recentLabs, reviews] = await Promise.all([
    svc.health.report(),
    svc.workOrders.counts(),
    svc.workOrders.list(undefined, 5),
    svc.labSessions.listRecent(learnerId, 8),
    svc.reviewItems.listOpen(8),
  ]);
  // Ages are relative to the health check instant so render stays pure.
  const now = Date.parse(report.checked_at);
  const pending =
    counts.draft + counts.exported + counts.in_progress + counts.implemented;
  return (
    <div className="flex h-full flex-col">
      <WorkspaceTitle
        crumbs={[{ label: "HiveMind" }, { label: "Control Center" }]}
        title="Control Center"
        subtitle="active target, queues, environment"
      />
      <div className="grid flex-1 grid-cols-2 gap-3 p-4">
        <Pane title="Active target" testId="pane-target">
          <EmptyRow
            text="no target"
            action={<span className="text-dim">select target · Stage 06</span>}
          />
          <p className="px-3 pb-2 text-[11px] text-dim">
            Readiness is alignment with the modeled role, not a hiring probability.
          </p>
        </Pane>
        <Pane title="Environment" testId="pane-environment">
          <table className="hm-table">
            <thead>
              <tr>
                <th>component</th>
                <th>state</th>
                <th>detail</th>
                <th className="num">latency</th>
              </tr>
            </thead>
            <tbody>
              {report.components.map((component) => (
                <tr key={component.component}>
                  <td className="hm-mono">{component.component}</td>
                  <td>
                    <StatusChip kind="connection" value={component.state} />
                  </td>
                  <td className="text-muted">
                    {component.detail ??
                      (component.state === "unconfigured"
                        ? "not configured in this environment"
                        : "")}
                  </td>
                  <td className="num">
                    {component.latency_ms === undefined
                      ? "—"
                      : `${component.latency_ms} ms`}
                  </td>
                </tr>
              ))}
              {Object.entries(report.runtime_versions).map(([name, version]) => (
                <tr key={`rt-${name}`}>
                  <td className="hm-mono">{name}</td>
                  <td>
                    <StatusChip value="current" />
                  </td>
                  <td className="hm-mono text-muted">{version}</td>
                  <td className="num">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Pane>
        <Pane title="Work queue" testId="pane-work-queue">
          <EmptyRow
            text="no items"
            action={<span className="text-dim">training queue · Stage 06</span>}
          />
        </Pane>
        <Pane title="Due reviews" count={reviews.length} testId="pane-reviews">
          {reviews.length === 0 ? (
            <EmptyRow
              text="no items"
              action={<span className="text-dim">review queue · Stage 05</span>}
            />
          ) : (
            <table className="hm-table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>kind</th>
                  <th>target</th>
                  <th>state</th>
                  <th className="num">age</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <IdBadge id={item.id} />
                    </td>
                    <td>{item.kind}</td>
                    <td className="hm-mono">{item.target_id}</td>
                    <td>
                      <StatusChip kind="qa" value={item.qa_state} />
                    </td>
                    <td className="num">{age(item.opened_at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Pane>
        <Pane title="Recent labs" count={recentLabs.length} testId="pane-labs">
          {recentLabs.length === 0 ? (
            <EmptyRow
              text="no items"
              action={<span className="text-dim">launch a lab · Stage 04</span>}
            />
          ) : (
            <table className="hm-table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>problem</th>
                  <th>lifecycle</th>
                  <th className="num">age</th>
                </tr>
              </thead>
              <tbody>
                {recentLabs.map((lab) => (
                  <tr key={lab.id}>
                    <td>
                      <IdBadge id={lab.id} />
                    </td>
                    <td className="hm-mono">{lab.problem_instance_id ?? "—"}</td>
                    <td>
                      <StatusChip kind="lifecycle" value={lab.status} />
                    </td>
                    <td className="num">{age(lab.created_at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Pane>
        <Pane
          title="Work orders"
          count={pending}
          testId="pane-work-orders"
          actions={
            <Link
              href="/work-orders?new=1"
              className="hm-mono text-accent hover:underline"
            >
              new work order <kbd className="text-dim">n</kbd>
            </Link>
          }
        >
          <div className="hm-mono flex gap-4 border-b border-border px-3 py-1 text-[11px] text-muted">
            {(["draft", "exported", "in_progress", "review_required"] as const).map(
              (status) => (
                <span key={status}>
                  {status} <span className="text-text">{counts[status]}</span>
                </span>
              ),
            )}
          </div>
          {recentOrders.length === 0 ? (
            <EmptyRow
              text="no work orders"
              action={
                <Link href="/work-orders?new=1" className="text-accent hover:underline">
                  create one from any lesson
                </Link>
              }
            />
          ) : (
            <table className="hm-table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>title</th>
                  <th>exec</th>
                  <th>status</th>
                  <th className="num">updated</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <IdBadge id={order.id} href={`/work-orders?id=${order.id}`} />
                    </td>
                    <td>{order.title}</td>
                    <td>
                      <ExecutionBadge mode={order.execution} />
                    </td>
                    <td>
                      <StatusChip kind="work_order" value={order.status} />
                    </td>
                    <td className="num">{age(order.updated_at, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Pane>
      </div>
    </div>
  );
}
