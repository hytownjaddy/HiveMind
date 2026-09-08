import { Suspense } from "react";

import { RecentSessions } from "@/components/labs/RecentSessions";

export const dynamic = "force-dynamic";

const CARDS = [
  ["Current goal", "Career target and prescription (RFP §122-132)"],
  ["Overall mastery", "Skill-level mastery engine (RFP §51-53)"],
  ["Role readiness", "Evidence-based readiness (RFP §125-126)"],
  ["Recommended task", "Adaptive next-skill picker (RFP §55-56)"],
  ["Due reviews", "Spaced repetition (RFP §54)"],
  ["Weak skills", "Retention-aware weakness list (RFP §96)"],
] as const;

export default function DashboardPage() {
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-zinc-400">RFP §88</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map(([title, hint]) => (
          <div key={title} className="rounded-md border border-zinc-800 p-4">
            <h2 className="text-sm font-medium text-zinc-200">{title}</h2>
            <p className="mt-1 text-xs text-zinc-500">{hint}</p>
            <p className="mt-3 text-2xl font-semibold text-zinc-700">—</p>
          </div>
        ))}
      </div>
      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Recent lab sessions
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
