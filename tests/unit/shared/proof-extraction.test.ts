import { describe, expect, it, vi } from "vitest";

import {
  extractProofFieldsFromText,
  resolveValidationStatus,
  shouldAutoVerifyProof,
} from "../../../packages/shared/src/utils/proof-extraction.ts";

describe("shared/utils/proof-extraction", () => {
  it("extracts today and yesterday date keywords", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-12T15:00:00Z"));

    const today = extractProofFieldsFromText("Today moving time 1:32:00 distance 12.5 km avg 152 bpm");
    const yesterday = extractProofFieldsFromText("Yesterday elapsed time 55 min distance 10 km avg hr 145 bpm");

    expect(today.extractedFields.date?.slice(0, 10)).toBe("2026-02-12");
    expect(yesterday.extractedFields.date?.slice(0, 10)).toBe("2026-02-11");

    vi.useRealTimers();
  });

  it("parses concept2-style OCR text", () => {
    const text = [
      "Concept2 PM5",
      "Jan 29 2026",
      "Total Time 01:32:15",
      "Meters",
      "12591",
      "Avg HR 152 bpm",
    ].join("\n");

    const result = extractProofFieldsFromText(text);

    expect(result.extractedFields.date?.slice(0, 10)).toBe("2026-01-29");
    expect(result.extractedFields.minutes).toBe(92);
    expect(result.extractedFields.distance).toBeCloseTo(12.591);
    expect(result.extractedFields.avgHr).toBe(152);
    expect(result.hasRequired).toBe(true);
  });

  it("auto-verifies with distance truncation rule", () => {
    const autoVerified = shouldAutoVerifyProof(
      {
        date: new Date("2026-01-29T12:00:00Z"),
        minutes: 92,
        distance: 12.5,
        avgHr: 152,
      },
      {
        date: "2026-01-29T00:00:00.000Z",
        minutes: 92,
        distance: 12.591,
        avgHr: 152,
        activityType: null,
      },
    );

    expect(autoVerified).toBe(true);
  });

  it("does not auto-verify when required fields are missing", () => {
    const autoVerified = shouldAutoVerifyProof(
      {
        date: new Date("2026-01-29T12:00:00Z"),
        minutes: 92,
        distance: 12.5,
        avgHr: null,
      },
      {
        date: null,
        minutes: 92,
        distance: 12.591,
        avgHr: null,
        activityType: null,
      },
    );

    expect(autoVerified).toBe(false);
    expect(resolveValidationStatus(false, false)).toBe("EXTRACTION_INCOMPLETE");
    expect(resolveValidationStatus(true, false)).toBe("PENDING");
    expect(resolveValidationStatus(true, true)).toBe("VERIFIED");
  });
});
