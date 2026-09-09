import type { Confidence } from "@hivemind/schema";

/*
 * The single component that renders any percentage (UI-SYSTEM §6, D-014):
 * value · confidence · evidence count · last tested. Never a bare number.
 */

export interface ConfidenceScoreProps {
  readonly percent: number;
  readonly confidence: Confidence;
  readonly evidenceCount: number;
  readonly lastTested?: string | undefined;
  readonly variant?: "full" | "compact";
}

const BARS: Record<Confidence, string> = { low: "▮▯▯", medium: "▮▮▯", high: "▮▮▮" };

export function ConfidenceScore({
  percent,
  confidence,
  evidenceCount,
  lastTested,
  variant = "full",
}: ConfidenceScoreProps) {
  const full = `${percent}% · conf ${confidence} · ${evidenceCount} evidence${lastTested === undefined ? "" : ` · tested ${lastTested}`}`;
  if (variant === "compact") {
    return (
      <span className="hm-mono text-[12px]" title={full}>
        {percent}% {BARS[confidence]}
      </span>
    );
  }
  return <span className="hm-mono text-[12px]">{full}</span>;
}
