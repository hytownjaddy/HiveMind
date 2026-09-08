import type { Metadata } from "next";
import { Suspense } from "react";

import { LaunchLabForm } from "@/components/labs/LaunchLabForm";
import { RecentSessions } from "@/components/labs/RecentSessions";

export const metadata: Metadata = { title: "Labs" };
export const dynamic = "force-dynamic";

export default function LabsPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Labs</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Each session is one Durable Object: lifecycle authority, replayable event log,
        terminal WebSocket, and expiry alarm. Providers plug in behind it (RFP §36, §86).
      </p>
      <div className="mt-6">
        <LaunchLabForm />
      </div>
      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Your sessions
        </h2>
        <div className="mt-3">
          <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
            <RecentSessions />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
