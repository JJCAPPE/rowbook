import assert from "node:assert/strict";
import test from "node:test";
import { ValidationStatusValues } from "@rowbook/shared";

import { getWeightedAvgHrByWeek } from "../../apps/web/src/server/utils/heart-rate.ts";

test("weekly heart rate includes only verified workout minutes", () => {
  const weekStartAt = new Date("2026-09-27T04:00:00.000Z");
  const unverifiedWeekStartAt = new Date("2026-09-20T04:00:00.000Z");
  const unverifiedStatuses = ValidationStatusValues.filter((status) => status !== "VERIFIED");
  const averages = getWeightedAvgHrByWeek([
    { weekStartAt, validationStatus: "VERIFIED", creditPolicyVersion: 2, minutes: 10, avgHr: 100 },
    { weekStartAt, validationStatus: "VERIFIED", creditPolicyVersion: 2, minutes: 30, avgHr: 140 },
    ...unverifiedStatuses.flatMap((validationStatus) => [
      { weekStartAt, validationStatus, creditPolicyVersion: 2, minutes: 100, avgHr: 200 },
      { weekStartAt: unverifiedWeekStartAt, validationStatus, creditPolicyVersion: 2, minutes: 100, avgHr: 200 },
    ]),
  ]);

  assert.equal(averages.get(weekStartAt.toISOString()), 130);
  assert.equal(averages.has(unverifiedWeekStartAt.toISOString()), false);
});

test("weekly heart rate preserves historical credit while excluding new pending entries", () => {
  const weekStartAt = new Date("2026-09-27T04:00:00.000Z");
  const averages = getWeightedAvgHrByWeek([
    { weekStartAt, validationStatus: "VERIFIED", creditPolicyVersion: 2, minutes: 10, avgHr: 100 },
    { weekStartAt, validationStatus: "PENDING", creditPolicyVersion: 1, minutes: 30, avgHr: 140 },
    { weekStartAt, validationStatus: "PENDING", creditPolicyVersion: 2, minutes: 100, avgHr: 200 },
    { weekStartAt, validationStatus: "REJECTED", creditPolicyVersion: 1, minutes: 100, avgHr: 200 },
  ]);

  assert.equal(averages.get(weekStartAt.toISOString()), 130);
});
