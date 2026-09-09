import { describe, expect, it } from "vitest";

import { WORK_ORDER_STATUSES } from "./common/enums";
import { canTransitionWorkOrder, WORK_ORDER_TRANSITIONS } from "./work-order";

describe("work-order state machine", () => {
  it("follows the CONTRIBUTING.md path", () => {
    expect(canTransitionWorkOrder("draft", "exported")).toBe(true);
    expect(canTransitionWorkOrder("exported", "in_progress")).toBe(true);
    expect(canTransitionWorkOrder("in_progress", "implemented")).toBe(true);
    expect(canTransitionWorkOrder("implemented", "validation_failed")).toBe(true);
    expect(canTransitionWorkOrder("implemented", "review_required")).toBe(true);
    expect(canTransitionWorkOrder("review_required", "approved")).toBe(true);
    expect(canTransitionWorkOrder("approved", "done")).toBe(true);
  });

  it("rejects skips and reversals", () => {
    expect(canTransitionWorkOrder("draft", "done")).toBe(false);
    expect(canTransitionWorkOrder("done", "draft")).toBe(false);
    expect(canTransitionWorkOrder("approved", "in_progress")).toBe(false);
  });

  it("covers every status", () => {
    expect(Object.keys(WORK_ORDER_TRANSITIONS).sort()).toEqual(
      [...WORK_ORDER_STATUSES].sort(),
    );
  });
});
