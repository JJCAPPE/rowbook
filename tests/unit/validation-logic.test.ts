import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAutoVerification } from "../../apps/web/src/server/services/validation-logic.ts";

const entry = {
  activityType: "ERG" as const,
  date: new Date("2026-01-15T12:00:00-05:00"),
  minutes: 21,
  distance: 6.09,
  avgHr: null,
};

const evidence = {
  activityType: "ERG" as const,
  date: "2026-01-15",
  minutes: 21,
  durationSeconds: 1_270,
  elapsedSeconds: null,
  distance: 6.01,
  avgHr: null,
  confidence: 0.99,
  isSingleWorkout: true,
  reviewReason: null,
};

test("auto-verifies a claim supported by active workout time", () => {
  const result = evaluateAutoVerification(entry, [evidence]);
  assert.equal(result.autoVerified, true);
  assert.equal(result.validationStatus, "VERIFIED");
});

test("accepts underclaims without increasing the entered minutes", () => {
  const underclaim = { ...entry, minutes: 15 };
  const result = evaluateAutoVerification(underclaim, [evidence]);
  assert.equal(result.validationStatus, "VERIFIED");
  assert.equal(underclaim.minutes, 15);
});

test("reviews claims exceeding active time even if rounded minutes match", () => {
  const result = evaluateAutoVerification(entry, [
    { ...evidence, durationSeconds: 1_259, minutes: 21, elapsedSeconds: 1_800 },
  ]);
  assert.equal(result.autoVerified, false);
  assert.ok(result.reasons.some((reason) => reason.includes("minutes")));
});

test("accepts exact whole-minute boundaries and rejects one second short", () => {
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, durationSeconds: 1_260 }]).validationStatus, "VERIFIED");
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, durationSeconds: 1_259 }]).validationStatus, "PENDING");
});

test("does not require distance, heart rate, or an exact activity category", () => {
  for (const fields of [
    { distance: null, avgHr: null, activityType: null },
    { distance: 2, avgHr: 90, activityType: "CYCLE" as const },
  ]) {
    assert.equal(
      evaluateAutoVerification({ ...entry, avgHr: 150 }, [{ ...evidence, ...fields }]).validationStatus,
      "VERIFIED",
    );
  }
});

test("requires a matching workout date and readable active duration", () => {
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, date: null }]).validationStatus, "EXTRACTION_INCOMPLETE");
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, minutes: null, durationSeconds: null }]).validationStatus, "EXTRACTION_INCOMPLETE");
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, date: "2026-01-16" }]).validationStatus, "PENDING");
  assert.equal(evaluateAutoVerification(entry, []).validationStatus, "NOT_CHECKED");
});

test("uses exact seconds without requiring a separately extracted minute value", () => {
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, minutes: null }]).validationStatus, "VERIFIED");
});

test("supports legacy evidence containing only whole minutes", () => {
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, durationSeconds: null, minutes: 22 }]).validationStatus, "VERIFIED");
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, durationSeconds: null, minutes: 20 }]).validationStatus, "PENDING");
});

test("subminute workouts cannot support a whole minute of credit", () => {
  assert.equal(evaluateAutoVerification({ ...entry, minutes: 1 }, [{ ...evidence, durationSeconds: 59, minutes: 1 }]).validationStatus, "PENDING");
});

test("missing optional heart rate does not reject otherwise matching evidence", () => {
  const result = evaluateAutoVerification(
    { ...entry, avgHr: 150 },
    [evidence],
  );
  assert.equal(result.validationStatus, "VERIFIED");
});

test("low confidence and multiple-workout evidence require review", () => {
  const lowConfidence = evaluateAutoVerification(entry, [
    { ...evidence, confidence: 0.5 },
  ]);
  const multiple = evaluateAutoVerification(entry, [
    { ...evidence, isSingleWorkout: false },
  ]);
  assert.equal(lowConfidence.validationStatus, "PENDING");
  assert.equal(multiple.validationStatus, "PENDING");
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, confidence: 0.92 }]).validationStatus, "VERIFIED");
  assert.equal(evaluateAutoVerification(entry, [{ ...evidence, reviewReason: "The active duration is ambiguous." }]).validationStatus, "PENDING");
});

test("multiple screenshots are compared, never added together", () => {
  assert.equal(
    evaluateAutoVerification(entry, [evidence, evidence]).validationStatus,
    "VERIFIED",
  );
  assert.equal(
    evaluateAutoVerification(entry, [
      evidence,
      { ...evidence, minutes: 42, durationSeconds: 2_520 },
    ]).validationStatus,
    "PENDING",
  );
  assert.equal(
    evaluateAutoVerification({ ...entry, minutes: 42 }, [evidence, evidence]).validationStatus,
    "PENDING",
  );
});

test("incidental differences between legacy photos do not require review", () => {
  assert.equal(evaluateAutoVerification(entry, [evidence, { ...evidence, distance: 9, avgHr: 140 }]).validationStatus, "VERIFIED");
});

test("does not ignore evidence concerns on subsequent photos", () => {
  assert.equal(evaluateAutoVerification(entry, [evidence, { ...evidence, isSingleWorkout: false }]).validationStatus, "PENDING");
});
