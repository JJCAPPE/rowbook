import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  getPreviousWeekStartAt,
  getWeekEndAt,
  getWeekRange,
  getWeekStartAt,
  isWithinWeek,
} from "../../../packages/shared/src/utils/week.ts";

const ZONE = "America/New_York";

describe("shared/utils/week", () => {
  it("uses Sunday 8:00 PM ET as week start boundary", () => {
    const beforeCutoff = DateTime.fromISO("2026-02-08T19:59:59", { zone: ZONE }).toJSDate();
    const atCutoff = DateTime.fromISO("2026-02-08T20:00:00", { zone: ZONE }).toJSDate();

    const beforeStart = DateTime.fromJSDate(getWeekStartAt(beforeCutoff), { zone: ZONE });
    const atStart = DateTime.fromJSDate(getWeekStartAt(atCutoff), { zone: ZONE });

    expect(beforeStart.toFormat("yyyy-LL-dd HH:mm")).toBe("2026-02-01 20:00");
    expect(atStart.toFormat("yyyy-LL-dd HH:mm")).toBe("2026-02-08 20:00");
  });

  it("returns week end exactly one week after week start", () => {
    const start = getWeekStartAt(DateTime.fromISO("2026-02-10T09:00:00", { zone: ZONE }).toJSDate());
    const end = getWeekEndAt(start);

    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("treats week range as [start, end)", () => {
    const { weekStartAt, weekEndAt } = getWeekRange(
      DateTime.fromISO("2026-02-11T10:00:00", { zone: ZONE }).toJSDate(),
    );

    expect(isWithinWeek(weekStartAt, weekStartAt)).toBe(true);
    expect(isWithinWeek(weekEndAt, weekStartAt)).toBe(false);
  });

  it("computes previous week start from a date", () => {
    const current = getWeekStartAt(DateTime.fromISO("2026-02-12T12:00:00", { zone: ZONE }).toJSDate());
    const previous = getPreviousWeekStartAt(current);

    expect(current.getTime() - previous.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
