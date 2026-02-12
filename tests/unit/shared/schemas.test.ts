import { describe, expect, it } from "vitest";

import {
  ExemptionInputSchema,
  HeartRateSchema,
  ProofUploadRequestSchema,
  TrainingEntryInputSchema,
} from "../../../packages/shared/src/index.ts";

describe("shared schemas", () => {
  it("normalizes date-only strings to New York noon for entry input", () => {
    const parsed = TrainingEntryInputSchema.parse({
      activityType: "RUN",
      date: "2026-02-07",
      minutes: 45,
      distance: 10,
      avgHr: 151,
      avgPace: null,
      avgWatts: null,
      notes: null,
      proofImageIds: ["proof-id"],
      proofOcr: null,
    });

    expect(parsed.date.toISOString()).toContain("T17:00:00.000Z");
  });

  it("rounds heart-rate decimals before integer validation", () => {
    expect(HeartRateSchema.parse(152.4)).toBe(152);
    expect(HeartRateSchema.parse(152.6)).toBe(153);
  });

  it("validates proof upload mime types and size", () => {
    expect(() =>
      ProofUploadRequestSchema.parse({
        fileName: "proof.gif",
        fileSize: 1000,
        mimeType: "image/gif",
      }),
    ).toThrow();

    expect(
      ProofUploadRequestSchema.parse({
        fileName: "proof.png",
        fileSize: 1024,
        mimeType: "image/png",
      }).mimeType,
    ).toBe("image/png");
  });

  it("accepts optional indefinite exemption flags", () => {
    const parsed = ExemptionInputSchema.parse({
      athleteId: "athlete-id",
      weekStartAt: "2026-02-08T01:00:00.000Z",
      reason: "Injury",
      isIndefinite: true,
    });

    expect(parsed.isIndefinite).toBe(true);
  });
});
