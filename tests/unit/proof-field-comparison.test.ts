import assert from "node:assert/strict";
import test from "node:test";

import {
  compareProofFields,
  getExtractedMinutes,
} from "../../apps/web/src/lib/proof-field-comparison.ts";

const entered = {
  activityType: "ERG" as const,
  date: new Date("2026-01-15T12:00:00-05:00"),
  minutes: 21,
  distance: 6.09,
  avgHr: 154,
};

test("comparison mirrors canonical distance and date matching", () => {
  assert.deepEqual(
    compareProofFields(entered, {
      activityType: "ERG",
      date: "2026-01-15",
      minutes: 21,
      distance: 6.01,
      avgHr: 154,
    }),
    {
      activityType: "matches",
      date: "matches",
      minutes: "matches",
      distance: "matches",
      avgHr: "matches",
    },
  );
});

test("comparison distinguishes disagreements from missing photo values", () => {
  assert.deepEqual(
    compareProofFields(entered, {
      activityType: "RUN",
      date: "2026-01-16",
      minutes: 22,
      distance: null,
      avgHr: null,
    }),
    {
      activityType: "differs",
      date: "differs",
      minutes: "supported",
      distance: "missing",
      avgHr: "missing",
    },
  );
});

test("exact duration can stand in for rounded extracted minutes", () => {
  const comparison = compareProofFields(entered, {
    activityType: "ERG",
    date: "2026-01-15",
    minutes: null,
    durationSeconds: 1_270,
    distance: 6.09,
    avgHr: 154,
  });

  assert.equal(comparison.minutes, "matches");
});

test("underclaimed minutes are supported and overclaimed minutes require review", () => {
  assert.equal(compareProofFields(entered, { minutes: 30 }).minutes, "supported");
  assert.equal(compareProofFields(entered, { minutes: 20 }).minutes, "differs");
  assert.equal(compareProofFields(entered, {}).minutes, "missing");
});

test("exact active seconds take precedence over rounded extracted minutes", () => {
  const proof = { minutes: 21, durationSeconds: 1_259 };

  assert.equal(getExtractedMinutes(proof), 20);
  assert.equal(compareProofFields(entered, proof).minutes, "differs");
  assert.equal(getExtractedMinutes({ durationSeconds: 59 }), 0);
});

test("photo heart rate is different when the athlete did not enter one", () => {
  const comparison = compareProofFields(
    { ...entered, avgHr: null },
    {
      activityType: "ERG",
      date: "2026-01-15",
      minutes: 21,
      distance: 6.09,
      avgHr: 154,
    },
  );

  assert.equal(comparison.avgHr, "differs");
});
