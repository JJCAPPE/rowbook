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

test("auto-verifies exact canonical evidence using 0.1 km truncation", () => {
  const result = evaluateAutoVerification(entry, [evidence]);
  assert.equal(result.autoVerified, true);
  assert.equal(result.validationStatus, "VERIFIED");
});

test("does not accept one-sided minute mismatches", () => {
  const result = evaluateAutoVerification(entry, [
    { ...evidence, minutes: entry.minutes + 1 },
  ]);
  assert.equal(result.autoVerified, false);
  assert.ok(result.reasons.some((reason) => reason.includes("minutes")));
});

test("requires distance for measured activities but not OTHER", () => {
  assert.equal(
    evaluateAutoVerification(entry, [{ ...evidence, distance: null }])
      .validationStatus,
    "EXTRACTION_INCOMPLETE",
  );
  assert.equal(
    evaluateAutoVerification(
      { ...entry, activityType: "OTHER", distance: 0 },
      [{ ...evidence, activityType: "OTHER", distance: null }],
    ).validationStatus,
    "VERIFIED",
  );
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
});

test("multiple screenshots are compared, never added together", () => {
  assert.equal(
    evaluateAutoVerification(entry, [evidence, evidence]).validationStatus,
    "VERIFIED",
  );
  assert.equal(
    evaluateAutoVerification(entry, [
      evidence,
      { ...evidence, minutes: 42 },
    ]).validationStatus,
    "PENDING",
  );
});
