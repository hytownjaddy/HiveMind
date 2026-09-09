import type { Metadata } from "next";
import { Suspense } from "react";

import { workOrderStatusSchema, workOrderTemplateSchema } from "@hivemind/schema";

import { WorkOrdersScreen } from "@/components/work-orders/WorkOrdersScreen";
import { WorkspaceTitle } from "@/components/ui/WorkspaceTitle";
import { services } from "@/lib/server/services";

export const metadata: Metadata = { title: "Work Orders" };
export const dynamic = "force-dynamic";

/** 14-work-orders.md: the developer task queue for Claude work orders. */
export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    id?: string;
    new?: string;
    template?: string;
    lesson?: string;
  }>;
}) {
  const query = await searchParams;
  const status = workOrderStatusSchema.safeParse(query.status);
  const filter = status.success ? status.data : "all";
  const { workOrders } = await services();
  const [orders, counts, selectedOrder] = await Promise.all([
    workOrders.list(status.success ? status.data : undefined, 200),
    workOrders.counts(),
    query.id === undefined ? Promise.resolve(null) : workOrders.get(query.id),
  ]);
  const selected =
    selectedOrder === null
      ? null
      : {
          order: selectedOrder,
          prompt: workOrders.prompt(selectedOrder),
          file: workOrders.file(selectedOrder),
        };
  const template = workOrderTemplateSchema.safeParse(query.template);
  return (
    <div className="flex h-full flex-col">
      <WorkspaceTitle
        crumbs={[{ label: "HiveMind" }, { label: "Work Orders" }]}
        title="Claude Work Orders"
        subtitle="external execution by default · copy, export, validate, approve"
      />
      <Suspense
        fallback={<div className="hm-mono p-3 text-[12px] text-dim">loading…</div>}
      >
        <WorkOrdersScreen
          orders={orders}
          counts={counts}
          selected={selected}
          filter={filter}
          openNew={query.new === "1"}
          newTemplate={template.success ? template.data : undefined}
          newLesson={query.lesson}
        />
      </Suspense>
    </div>
  );
}
