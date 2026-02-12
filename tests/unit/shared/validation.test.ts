import { describe, expect, it } from "vitest";

import {
  compareAverageHr,
  compareDistanceKm,
  truncateDistanceKm,
} from "../../../packages/shared/src/utils/validation.ts";

describe("shared/utils/validation", () => {
  it("truncates distance to one decimal place", () => {
    expect(truncateDistanceKm(12.591)).toBe(12.5);
    expect(truncateDistanceKm(12.699)).toBe(12.6);
  });

  it("marks distance extraction as incomplete when proof value is missing", () => {
    const result = compareDistanceKm(12.5, null);

    expect(result.matches).toBe(true);
    expect(result.extractionIncomplete).toBe(true);
    expect(result.normalizedProofValue).toBeNull();
  });

  it("compares manual distance to truncated proof distance", () => {
    expect(compareDistanceKm(12.5, 12.591).matches).toBe(true);
    expect(compareDistanceKm(12.6, 12.591).matches).toBe(false);
  });

  it("compares average heart rate with optional proof values", () => {
    expect(compareAverageHr(152, 152).matches).toBe(true);
    expect(compareAverageHr(152, 151).matches).toBe(false);
    expect(compareAverageHr(152, null).extractionIncomplete).toBe(true);
  });
});
