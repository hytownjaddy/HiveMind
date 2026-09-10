import type { Metadata } from "next";
import { Suspense } from "react";

import { InfrastructureScreen } from "@/components/infrastructure/InfrastructureScreen";
import { WorkspaceTitle } from "@/components/ui/WorkspaceTitle";
import { services } from "@/lib/server/services";

export const metadata: Metadata = { title: "Runtimes" };
export const dynamic = "force-dynamic";

/** The Images & Runtimes tab of the Infrastructure console (pinned digests, update_available). */
export default async function RuntimesPage() {
  const { infrastructure } = await services();
  const overview = await infrastructure.overview();
  return (
    <div className="flex h-full flex-col">
      <WorkspaceTitle
        crumbs={[{ label: "HiveMind" }, { label: "System" }, { label: "Runtimes" }]}
        title="Runtimes"
        subtitle="images pinned by digest and tool versions the workers report"
      />
      <Suspense
        fallback={<div className="hm-mono p-3 text-[12px] text-dim">loading…</div>}
      >
        <InfrastructureScreen overview={overview} initialTab="runtimes" />
      </Suspense>
    </div>
  );
}
