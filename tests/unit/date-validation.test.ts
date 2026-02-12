import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { isDateInFuture, parseDateStringAsNewYorkNoon } from "../../packages/shared/src/utils/time.ts";

describe("date-only future check", () => {
  it("ignores time of day on same date", () => {
    const entryDate = parseDateStringAsNewYorkNoon("2026-02-07");
    const nowMorning = DateTime.fromISO("2026-02-07T08:15:00", { zone: "America/New_York" });

    expect(isDateInFuture(entryDate, nowMorning)).toBe(false);
  });

  it("rejects a later calendar date", () => {
    const entryDate = parseDateStringAsNewYorkNoon("2026-02-08");
    const nowEvening = DateTime.fromISO("2026-02-07T22:45:00", { zone: "America/New_York" });

    expect(isDateInFuture(entryDate, nowEvening)).toBe(true);
  });

  it("allows an earlier calendar date", () => {
    const entryDate = parseDateStringAsNewYorkNoon("2026-02-06");
    const nowMorning = DateTime.fromISO("2026-02-07T08:15:00", { zone: "America/New_York" });

    expect(isDateInFuture(entryDate, nowMorning)).toBe(false);
  });
});
