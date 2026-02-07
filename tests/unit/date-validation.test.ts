import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";

import { isDateInFuture, parseDateStringAsNewYorkNoon } from "../../packages/shared/src/utils/time.ts";

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
