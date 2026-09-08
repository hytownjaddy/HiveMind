import { describe, expect, it } from "vitest";

import { reconnectDelayMs } from "./backoff";

describe("reconnectDelayMs", () => {
  it("grows with attempts and stays bounded", () => {
    const first = reconnectDelayMs(0);
    const later = reconnectDelayMs(10);
    expect(first).toBeGreaterThanOrEqual(250);
    expect(first).toBeLessThan(600);
    expect(later).toBeLessThanOrEqual(8_000);
  });
});
