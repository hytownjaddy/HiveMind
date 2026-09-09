/*
 * Lowercase monospace chips on a tinted background (UI-SYSTEM §4–5). Colour
 * is chosen by the canonical value, never by free text.
 */

export type ChipKind =
  "lifecycle" | "connection" | "qa" | "work_order" | "freshness" | "generic";

const COLOR: Record<string, string> = {
  // success
  passed: "success",
  ready: "success",
  current: "success",
  online: "success",
  completed: "success",
  published: "success",
  approved: "success",
  done: "success",
  verified: "success",
  // info
  active: "info",
  in_progress: "info",
  provisioning: "info",
  baseline_check: "info",
  grading: "info",
  connecting: "info",
  synchronizing: "info",
  exported: "info",
  technical_review: "info",
  instructional_review: "info",
  execution_test: "info",
  // warning
  needs_review: "warning",
  stale: "warning",
  degraded: "warning",
  capped: "warning",
  review_required: "warning",
  validation_failed: "warning",
  update_available: "warning",
  conflict: "warning",
  // danger
  failed: "danger",
  broken: "danger",
  blocking: "danger",
  rejected: "danger",
  // muted
  queued: "muted",
  pending: "muted",
  draft: "muted",
  destroyed: "muted",
  destroying: "muted",
  offline: "muted",
  finished: "muted",
  deprecated: "muted",
  archived: "muted",
  unconfigured: "muted",
  unverified: "muted",
  // violet
  fault_injection: "violet",
  fault_check: "violet",
  ai: "violet",
};

const CLASSES: Record<string, string> = {
  success: "text-success border-success/40 bg-success/10",
  info: "text-info border-info/40 bg-info/10",
  warning: "text-warning border-warning/40 bg-warning/10",
  danger: "text-danger border-danger/40 bg-danger/10",
  muted: "text-muted border-border bg-panel-2",
  violet: "text-violet border-violet/40 bg-violet/10",
};

export function StatusChip({
  value,
  kind = "generic",
}: {
  readonly value: string;
  readonly kind?: ChipKind;
}) {
  const tone = COLOR[value] ?? "muted";
  return (
    <span
      data-kind={kind}
      className={`hm-mono inline-flex h-[18px] items-center rounded-sm border px-1.5 text-[11px] leading-none ${CLASSES[tone]}`}
    >
      {value}
    </span>
  );
}
