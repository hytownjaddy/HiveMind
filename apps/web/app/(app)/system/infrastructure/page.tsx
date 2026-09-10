import type { Metadata } from "next";
import { Suspense } from "react";

import {
  InfrastructureScreen,
  type InfrastructureTab,
} from "@/components/infrastructure/InfrastructureScreen";
import { WorkspaceTitle } from "@/components/ui/WorkspaceTitle";
import { services } from "@/lib/server/services";

export const metadata: Metadata = { title: "Infrastructure" };
export const dynamic = "force-dynamic";

const TABS = new Set<InfrastructureTab>([
  "workers",
  "sessions",
  "queue",
  "runtimes",
  "jobs",
  "events",
  "cloudflare",
  "configuration",
]);

/** 18-infrastructure-console.md: workers, sessions, runtimes, events, Cloudflare. */
export default async function InfrastructurePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const query = await searchParams;
  const tab = TABS.has(query.tab as InfrastructureTab)
    ? (query.tab as InfrastructureTab)
    : "workers";
  const { infrastructure } = await services();
  const overview = await infrastructure.overview();
  return (
    <div className="flex h-full flex-col">
      <WorkspaceTitle
        crumbs={[{ label: "HiveMind" }, { label: "System" }, { label: "Infrastructure" }]}
        title="Infrastructure"
        subtitle="lab workers, sessions by provider class, runtime pins, Cloudflare"
      />
      <Suspense
        fallback={<div className="hm-mono p-3 text-[12px] text-dim">loading…</div>}
      >
        <InfrastructureScreen overview={overview} initialTab={tab} />
      </Suspense>
    </div>
  );
}
