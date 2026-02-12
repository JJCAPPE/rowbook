import { describe, expect, it } from "vitest";

import { evaluateAutoVerification, isDateMatch } from "../../../apps/web/src/server/services/validation-logic.ts";

describe("server/services/validation-logic", () => {
  it("matches same calendar date across zoned parsing", () => {
    const entryDate = new Date("2026-02-07T17:00:00.000Z");

    expect(isDateMatch(entryDate, "2026-02-07")).toBe(true);
    expect(isDateMatch(entryDate, "2026-02-08")).toBe(false);
    expect(isDateMatch(entryDate, null)).toBe(false);
  });

  it("auto-verifies when all proofs extracted and totals match", () => {
    const result = evaluateAutoVerification(
      { date: new Date("2026-02-07T17:00:00.000Z"), minutes: 90 },
      [
        { date: "2026-02-07", minutes: 30 },
        { date: "2026-02-07", minutes: 60 },
      ],
    );

    expect(result).toEqual({
      autoVerified: true,
      validationStatus: "VERIFIED",
    });
  });

  it("returns pending when extraction is incomplete", () => {
    const result = evaluateAutoVerification(
      { date: new Date("2026-02-07T17:00:00.000Z"), minutes: 90 },
      [{ date: null, minutes: null }],
    );

    expect(result).toEqual({
      autoVerified: false,
      validationStatus: "PENDING",
    });
  });

  it("returns not checked with no proofs", () => {
    const result = evaluateAutoVerification(
      { date: new Date("2026-02-07T17:00:00.000Z"), minutes: 90 },
      [],
    );

    expect(result.validationStatus).toBe("NOT_CHECKED");
  });
});
