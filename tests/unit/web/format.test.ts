import { describe, expect, it } from "vitest";

import {
  formatDistance,
  formatFullDate,
  formatMinutes,
  formatShortDate,
  formatWeekRange,
} from "../../../apps/web/src/lib/format.ts";

describe("web/lib/format", () => {
  it("formats minutes across short and hour-based durations", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(125)).toBe("2h 5m");
  });

  it("formats distance and null placeholders", () => {
    expect(formatDistance(12.591)).toBe("12.591 km");
    expect(formatDistance(null)).toBe("—");
  });

  it("formats week ranges and date labels", () => {
    const start = new Date("2026-02-08T01:00:00.000Z");
    const end = new Date("2026-02-15T01:00:00.000Z");

    expect(formatShortDate(start)).toMatch(/[A-Z][a-z]{2} \d{1,2}/);
    expect(formatFullDate(start)).toMatch(/^[A-Z][a-z]{2}/);
    expect(formatWeekRange(start, end)).toContain("-");
  });
});
