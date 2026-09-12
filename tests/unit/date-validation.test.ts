import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";

import {
  formatInTimeZone,
  isDateInFuture,
  parseDateStringAsNewYorkNoon,
} from "../../packages/shared/src/utils/time.ts";
import { getWeekEndAt } from "../../packages/shared/src/utils/week.ts";

test("date-only future check ignores time of day on same date", () => {
  const entryDate = parseDateStringAsNewYorkNoon("2026-02-07");
  const nowMorning = DateTime.fromISO("2026-02-07T08:15:00", { zone: "America/New_York" });

  assert.equal(isDateInFuture(entryDate, nowMorning), false);
});

test("date-only future check rejects a later calendar date", () => {
  const entryDate = parseDateStringAsNewYorkNoon("2026-02-08");
  const nowEvening = DateTime.fromISO("2026-02-07T22:45:00", { zone: "America/New_York" });

  assert.equal(isDateInFuture(entryDate, nowEvening), true);
});

test("date-only future check allows an earlier calendar date", () => {
  const entryDate = parseDateStringAsNewYorkNoon("2026-02-06");
  const nowMorning = DateTime.fromISO("2026-02-07T08:15:00", { zone: "America/New_York" });

  assert.equal(isDateInFuture(entryDate, nowMorning), false);
});

test("date inputs stay on the New York calendar date in ahead-of-New-York timezones", () => {
  const newYorkNoon = parseDateStringAsNewYorkNoon("2026-09-11");

  assert.equal(formatInTimeZone(newYorkNoon), "2026-09-11");
  assert.equal(
    DateTime.fromJSDate(newYorkNoon).setZone("Asia/Tokyo").toISODate(),
    "2026-09-12",
  );
});

test("weekly target boundaries retain Sunday 20:00 New York across DST", () => {
  assert.equal(
    getWeekEndAt(new Date("2026-03-02T01:00:00.000Z")).toISOString(),
    "2026-03-09T00:00:00.000Z",
  );
  assert.equal(
    getWeekEndAt(new Date("2026-10-26T00:00:00.000Z")).toISOString(),
    "2026-11-02T01:00:00.000Z",
  );
});
