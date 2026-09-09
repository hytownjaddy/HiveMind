import { LAB_STATUSES, type LabStatus } from "@hivemind/schema";

const PATH: readonly LabStatus[] = [
  "queued",
  "provisioning",
  "baseline_check",
  "fault_injection",
  "fault_check",
  "ready",
  "active",
  "grading",
  "completed",
];

/** Lifecycle from RFP §86; the object advances it, the client only renders it. */
export function LifecycleTimeline({ status }: { readonly status: LabStatus | null }) {
  const currentIndex = status === null ? -1 : PATH.indexOf(status);
  const terminal = status !== null && !PATH.includes(status) ? status : null;
  return (
    <ol className="space-y-1.5">
      {PATH.map((step, index) => {
        const state =
          terminal !== null
            ? "muted"
            : index < currentIndex
              ? "done"
              : index === currentIndex
                ? "current"
                : "pending";
        return (
          <li key={step} className="flex items-center gap-2 font-mono text-xs">
            <span
              aria-hidden
              className={
                state === "current"
                  ? "h-2 w-2 rounded-full bg-hive-amber"
                  : state === "done"
                    ? "h-2 w-2 rounded-full bg-emerald-500"
                    : "h-2 w-2 rounded-full bg-zinc-700"
              }
            />
            <span
              className={
                state === "current"
                  ? "text-zinc-100"
                  : state === "done"
                    ? "text-zinc-400"
                    : "text-zinc-600"
              }
            >
              {step}
            </span>
          </li>
        );
      })}
      {terminal === null ? null : (
        <li className="mt-3 flex items-center gap-2 font-mono text-xs text-zinc-300">
          <span aria-hidden className="h-2 w-2 rounded-full bg-red-500" />
          {terminal}
        </li>
      )}
      <li className="sr-only">All states: {LAB_STATUSES.join(", ")}</li>
    </ol>
  );
}
