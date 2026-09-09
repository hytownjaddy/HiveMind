"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  WORK_ORDER_STATUSES,
  type WorkOrder,
  type WorkOrderStatus,
  type WorkOrderTemplate,
} from "@hivemind/schema";

import { ExecutionBadge } from "@/components/ui/ExecutionBadge";
import { IdBadge } from "@/components/ui/IdBadge";
import { StatusChip } from "@/components/ui/StatusChip";
import { EmptyRow } from "@/components/ui/Pane";

import { WorkOrderDetail } from "./WorkOrderDetail";
import { WorkOrderPanel } from "./WorkOrderPanel";

export interface WorkOrdersScreenProps {
  readonly orders: readonly WorkOrder[];
  readonly counts: Readonly<Record<WorkOrderStatus, number>>;
  readonly selected: {
    readonly order: WorkOrder;
    readonly prompt: string;
    readonly file: string;
  } | null;
  readonly filter: WorkOrderStatus | "all";
  readonly openNew: boolean;
  readonly newTemplate?: WorkOrderTemplate | undefined;
  readonly newLesson?: string | undefined;
}

/** Work Orders screen: status tabs, table, detail, and the new-order panel; `n` opens the panel, `j`/`k` move rows. */
export function WorkOrdersScreen({
  orders,
  counts,
  selected,
  filter,
  openNew,
  newTemplate,
  newLesson,
}: WorkOrdersScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Panel visibility follows `?new=1`; `n` and close override it until the URL changes again.
  const [override, setOverride] = useState<boolean | null>(null);
  const [lastOpenNew, setLastOpenNew] = useState(openNew);
  if (openNew !== lastOpenNew) {
    setLastOpenNew(openNew);
    setOverride(null);
  }
  const panel = override ?? openNew;
  const setPanel = setOverride;

  function navigate(next: Record<string, string | null>): void {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    const text = query.toString();
    router.push(text.length === 0 ? pathname : `${pathname}?${text}`);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      if (event.key === "n") {
        setPanel(true);
      } else if ((event.key === "j" || event.key === "k") && orders.length > 0) {
        const index = orders.findIndex((order) => order.id === selected?.order.id);
        const next =
          orders[
            Math.min(Math.max(index + (event.key === "j" ? 1 : -1), 0), orders.length - 1)
          ];
        if (next !== undefined) {
          navigate({ id: next.id, new: null });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate closes over router/params which change per render
  }, [orders, selected]);

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px]">
      <div className="flex min-h-0 flex-col">
        <div
          role="tablist"
          className="hm-mono flex gap-3 overflow-x-auto border-b border-border px-3 text-[11px]"
        >
          {(["all", ...WORK_ORDER_STATUSES] as const).map((status) => (
            <button
              key={status}
              role="tab"
              type="button"
              aria-selected={filter === status}
              onClick={() => navigate({ status: status === "all" ? null : status })}
              className={`h-8 border-b-2 whitespace-nowrap ${filter === status ? "border-accent text-text" : "border-transparent text-muted hover:text-text"}`}
            >
              {status}{" "}
              <span className="text-dim">
                {status === "all" ? total : counts[status]}
              </span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {orders.length === 0 ? (
            <EmptyRow
              text="no work orders · create one from any lesson, skill, or maintenance item"
              action={
                <button
                  type="button"
                  onClick={() => setPanel(true)}
                  className="text-accent hover:underline"
                >
                  new work order
                </button>
              }
            />
          ) : (
            <table className="hm-table">
              <thead>
                <tr>
                  <th>id</th>
                  <th>type</th>
                  <th>title</th>
                  <th>target</th>
                  <th>exec</th>
                  <th>status</th>
                  <th className="num">updated</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    data-selected={selected?.order.id === order.id || undefined}
                    className={selected?.order.id === order.id ? "bg-panel-2" : ""}
                  >
                    <td>
                      <Link
                        href={`/work-orders?id=${order.id}`}
                        className="hover:underline"
                      >
                        <IdBadge id={order.id} />
                      </Link>
                    </td>
                    <td className="hm-mono">{order.template}</td>
                    <td>{order.title}</td>
                    <td className="hm-mono text-muted">{order.target.kind}</td>
                    <td>
                      <ExecutionBadge mode={order.execution} />
                    </td>
                    <td>
                      <StatusChip kind="work_order" value={order.status} />
                    </td>
                    <td className="num">{order.updated_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="min-h-0 border-l border-border bg-panel">
        {panel ? (
          <WorkOrderPanel
            initialTemplate={newTemplate}
            initialLesson={newLesson}
            onClose={(createdId) => {
              setPanel(false);
              navigate({
                new: null,
                template: null,
                lesson: null,
                ...(createdId === undefined ? {} : { id: createdId }),
              });
            }}
          />
        ) : selected !== null ? (
          <WorkOrderDetail
            order={selected.order}
            prompt={selected.prompt}
            file={selected.file}
          />
        ) : (
          <div className="hm-mono p-3 text-[12px] text-dim">
            select a work order · n creates one
          </div>
        )}
      </div>
    </div>
  );
}
