import { describe, expect, it } from "vitest";

import {
  getWeightedAvgHr,
  getWeightedAvgHrByWeek,
} from "../../../apps/web/src/server/utils/heart-rate.ts";

describe("server/utils/heart-rate", () => {
  it("computes weighted average heart rate", () => {
    const avg = getWeightedAvgHr([
      { minutes: 30, avgHr: 150 },
      { minutes: 60, avgHr: 160 },
      { minutes: 15, avgHr: null },
    ]);

    expect(avg).toBe(157);
  });

  it("returns null when no valid heart-rate rows exist", () => {
    expect(
      getWeightedAvgHr([
        { minutes: 30, avgHr: null },
        { minutes: 0, avgHr: 150 },
      ]),
    ).toBeNull();
  });

  it("groups weighted averages by week and ignores rejected entries", () => {
    const weekA = new Date("2026-02-01T01:00:00.000Z");
    const weekB = new Date("2026-02-08T01:00:00.000Z");

    const result = getWeightedAvgHrByWeek([
      { weekStartAt: weekA, minutes: 30, avgHr: 150, validationStatus: "VERIFIED" },
      { weekStartAt: weekA, minutes: 30, avgHr: 160, validationStatus: "PENDING" },
      { weekStartAt: weekA, minutes: 30, avgHr: 140, validationStatus: "REJECTED" },
      { weekStartAt: weekB, minutes: 40, avgHr: 145, validationStatus: "VERIFIED" },
    ]);

    expect(result.get(weekA.toISOString())).toBe(155);
    expect(result.get(weekB.toISOString())).toBe(145);
  });
});
