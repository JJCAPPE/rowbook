import assert from "node:assert/strict";
import test from "node:test";

import { compareProofFields } from "../../apps/web/src/lib/proof-field-comparison.ts";

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
      minutes: "differs",
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
