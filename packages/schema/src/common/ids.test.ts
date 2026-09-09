import { describe, expect, it } from "vitest";

import {
  formatIncidentId,
  formatLabSessionId,
  formatLessonId,
  formatWorkOrderId,
  idSequence,
  incidentIdSchema,
  labSessionIdSchema,
  lessonIdSchema,
  workOrderIdSchema,
} from "./ids";

describe("identifier formats (D-038)", () => {
  it("formats the documented examples", () => {
    expect(formatWorkOrderId(184)).toBe("HM-WO-0184");
    expect(formatLabSessionId(829143)).toBe("HM-LAB-829143");
    expect(formatIncidentId("2026-09-08", 1)).toBe("HM-INC-20260908-001");
    expect(formatLessonId("linux-networking", 3)).toBe("HM-LESSON-linux-networking-03");
  });

  it("validates and rejects", () => {
    expect(workOrderIdSchema.safeParse("HM-WO-0184").success).toBe(true);
    expect(workOrderIdSchema.safeParse("HM-WO-184").success).toBe(false);
    expect(labSessionIdSchema.safeParse("HM-LAB-829143").success).toBe(true);
    expect(labSessionIdSchema.safeParse("HM-48291").success).toBe(false);
    expect(incidentIdSchema.safeParse("HM-INC-20260908-001").success).toBe(true);
    expect(lessonIdSchema.safeParse("HM-LESSON-BGP-03").success).toBe(false);
  });

  it("grows past the padding width", () => {
    expect(formatWorkOrderId(12345)).toBe("HM-WO-12345");
    expect(() => formatLabSessionId(1_000_000)).toThrow(RangeError);
    expect(idSequence("HM-WO-0184")).toBe(184);
  });
});
