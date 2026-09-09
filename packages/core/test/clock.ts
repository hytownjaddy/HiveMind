import type { Clock } from "../src/db/index";

/** Deterministic clock; each call advances one second so ordering is stable. */
export function fixedClock(start = "2026-09-09T12:00:00Z"): Clock & { ticks: number } {
  const base = Date.parse(start);
  const clock = {
    ticks: 0,
    now: (): string => {
      const at = new Date(base + clock.ticks * 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/u, "Z");
      clock.ticks += 1;
      return at;
    },
  };
  return clock;
}
