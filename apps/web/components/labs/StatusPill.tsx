import type { LabStatus } from "@hivemind/protocol";

const STYLES: Record<LabStatus, string> = {
  queued: "bg-zinc-800 text-zinc-300",
  provisioning: "bg-sky-950 text-sky-300",
  baseline_check: "bg-sky-950 text-sky-300",
  fault_injection: "bg-violet-950 text-violet-300",
  fault_check: "bg-violet-950 text-violet-300",
  ready: "bg-emerald-950 text-emerald-300",
  active: "bg-emerald-900 text-emerald-200",
  grading: "bg-amber-950 text-amber-300",
  completed: "bg-emerald-950 text-emerald-300",
  destroying: "bg-orange-950 text-orange-300",
  destroyed: "bg-zinc-900 text-zinc-500",
  failed: "bg-red-950 text-red-300",
};

export function StatusPill({ status }: { readonly status: LabStatus | null }) {
  const style = status === null ? "bg-zinc-900 text-zinc-500" : STYLES[status];
  return (
    <span
      data-testid="lab-status"
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs ${style}`}
    >
      {status ?? "unknown"}
    </span>
  );
}
