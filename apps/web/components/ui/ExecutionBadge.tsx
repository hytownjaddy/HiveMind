import type { ExecutionMode } from "@hivemind/schema";

/** AI execution mode badge (UI-SYSTEM §9, D-009): `external` by default. */
export function ExecutionBadge({ mode }: { readonly mode: ExecutionMode }) {
  return (
    <span
      className={`hm-mono inline-flex h-[18px] items-center rounded-sm border px-1.5 text-[11px] ${
        mode === "api" ? "border-violet/40 text-violet" : "border-border text-muted"
      }`}
    >
      {mode}
    </span>
  );
}
