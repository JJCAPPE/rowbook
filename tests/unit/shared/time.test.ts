import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIMEZONE,
  formatInTimeZone,
  isDateInFuture,
  parseDateStringAsNewYorkNoon,
  toDateTime,
} from "../../../packages/shared/src/utils/time.ts";

describe("shared/utils/time", () => {
  it("parses date-only strings as noon in New York", () => {
    const parsed = DateTime.fromJSDate(parseDateStringAsNewYorkNoon("2026-02-07"), {
      zone: DEFAULT_TIMEZONE,
    });

    expect(parsed.toISODate()).toBe("2026-02-07");
    expect(parsed.hour).toBe(12);
  });

  it("throws on invalid date strings", () => {
    expect(() => parseDateStringAsNewYorkNoon("2026-13-40")).toThrow(/Invalid date string/);
  });

  it("compares calendar dates only in isDateInFuture", () => {
    const entryDate = parseDateStringAsNewYorkNoon("2026-02-07");
    const nowMorning = DateTime.fromISO("2026-02-07T08:15:00", { zone: DEFAULT_TIMEZONE });

    expect(isDateInFuture(entryDate, nowMorning)).toBe(false);
    expect(
      isDateInFuture(parseDateStringAsNewYorkNoon("2026-02-08"), nowMorning),
    ).toBe(true);
  });

  it("formats and normalizes zoned input", () => {
    const dt = toDateTime("2026-03-08T01:30:00", DEFAULT_TIMEZONE);

    expect(dt.isValid).toBe(true);
    expect(formatInTimeZone(dt, DEFAULT_TIMEZONE, "yyyy-LL-dd HH:mm")).toBe("2026-03-08 01:30");
  });
});
