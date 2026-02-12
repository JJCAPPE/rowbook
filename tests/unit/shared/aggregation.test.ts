import { describe, expect, it } from "vitest";

import {
  countSessions,
  getActivityMix,
  getActivityTypes,
  hasHrData,
  sumDistanceKm,
  sumMinutes,
} from "../../../packages/shared/src/utils/aggregation.ts";

describe("shared/utils/aggregation", () => {
  const entries = [
    { activityType: "ERG" as const, minutes: 30, distance: 8, avgHr: 150 },
    { activityType: "RUN" as const, minutes: 45, distance: 10.2, avgHr: null },
    { activityType: "ERG" as const, minutes: 15, distance: 4.1, avgHr: 148 },
  ];

  it("sums minutes and distance", () => {
    expect(sumMinutes(entries)).toBe(90);
    expect(sumDistanceKm(entries)).toBeCloseTo(22.3);
  });

  it("counts sessions and detects HR data", () => {
    expect(countSessions(entries)).toBe(3);
    expect(hasHrData(entries)).toBe(true);
  });

  it("builds activity mix and unique activity types", () => {
    expect(getActivityMix(entries)).toEqual([
      { type: "ERG", minutes: 45 },
      { type: "RUN", minutes: 45 },
    ]);
    expect(getActivityTypes(entries)).toEqual(["ERG", "RUN"]);
  });
});
