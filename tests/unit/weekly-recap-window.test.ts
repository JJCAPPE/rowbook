import assert from "node:assert/strict";
import test from "node:test";

import { getWeeklyRecapWindow } from "../../apps/web/src/server/jobs/weekly-recap-window.ts";

test("opens exactly at Sunday 20:00 New York time across spring DST", () => {
  const before = getWeeklyRecapWindow(new Date("2026-03-09T00:00:00.000Z"));
  assert.equal(before.isOpen, true);
  assert.equal(before.isInitialWindow, true);
  assert.equal(before.recapWeekStartAt.toISOString(), "2026-03-02T01:00:00.000Z");
  assert.equal(before.recapWeekEndAt.toISOString(), "2026-03-09T00:00:00.000Z");

  const oneSecondEarly = getWeeklyRecapWindow(new Date("2026-03-08T23:59:59.000Z"));
  assert.equal(oneSecondEarly.isOpen, false);
  assert.equal(oneSecondEarly.isInitialWindow, false);
});

test("uses the correct UTC cutoff after fall DST", () => {
  const cutoff = getWeeklyRecapWindow(new Date("2026-11-02T01:00:00.000Z"));
  assert.equal(cutoff.isOpen, true);
  assert.equal(cutoff.isInitialWindow, true);
  assert.equal(cutoff.recapWeekStartAt.toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(cutoff.recapWeekEndAt.toISOString(), "2026-11-02T01:00:00.000Z");
});

test("permits missed-run catch-up for less than 48 hours and then closes", () => {
  const cutoffMs = new Date("2026-09-14T00:00:00.000Z").getTime();
  const catchUp = getWeeklyRecapWindow(new Date(cutoffMs + 47 * 60 * 60 * 1_000));
  assert.equal(catchUp.isOpen, true);
  assert.equal(catchUp.isInitialWindow, false);
  assert.equal(catchUp.isCatchUpWindow, true);

  const boundary = getWeeklyRecapWindow(new Date(cutoffMs + 48 * 60 * 60 * 1_000));
  assert.equal(boundary.isOpen, false);
  assert.equal(boundary.isCatchUpWindow, false);
});
