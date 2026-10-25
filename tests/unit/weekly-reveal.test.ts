import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyReveal, completeWeeklyReveal, getPendingWeeklyReveal } from "../../apps/web/src/server/services/weekly-reveal-service.ts";

const week = new Date("2026-10-19T00:00:00.000Z");
const team = { id: "team", name: "Rowbook" };

test("the reveal is unavailable before its first scheduled launch without accessing storage", async () => {
  const user = { id: "athlete", email: "athlete@example.test", name: "Athlete", role: "ATHLETE" as const, status: "ACTIVE" as const };
  const beforeLaunch = new Date("2026-10-25T23:59:59.999Z");
  assert.equal(await getPendingWeeklyReveal(user, team.id, beforeLaunch), null);
  await assert.rejects(
    completeWeeklyReveal(user, { teamId: team.id, weekStartAt: new Date("2026-10-12T00:00:00.000Z") }, beforeLaunch),
    { code: "BAD_REQUEST" },
  );
});

const athlete = (
  athleteId: string,
  totalMinutes: number,
  previousWeekMinutes: number,
  overrides: Partial<Parameters<typeof buildWeeklyReveal>[2][number]> = {},
) => ({
  athleteId,
  name: athleteId,
  totalMinutes,
  previousWeekMinutes,
  activityTypes: ["ERG" as const, "RUN" as const],
  avgHr: 143,
  status: "MET" as const,
  missingMinutes: false,
  ...overrides,
});

test("podium ranks positive totals, with stable name/id tie breaking and full athlete stats", () => {
  const rows = [
    athlete("b", 200, 100, { name: "Alex" }),
    athlete("new", 300, 0),
    athlete("a", 200, 250, { name: "Alex" }),
    athlete("fourth", 150, 100),
    athlete("zero", 0, 0),
  ];
  const reveal = buildWeeklyReveal(team, week, rows);
  assert.deepEqual(reveal.podium.map((row) => [row.athleteId, row.rank]), [["new", 1], ["a", 2], ["b", 3]]);
  assert.equal(reveal.podium[0].percentChange, null);
  assert.equal(reveal.podium[1].percentChange, -20);
  assert.equal(reveal.podium[2].percentChange, 100);
  assert.deepEqual(reveal.podium[2].activityTypes, ["ERG", "RUN"]);
  assert.equal(reveal.podium[2].avgHr, 143);
  assert.deepEqual(rows.map((row) => row.athleteId), ["b", "new", "a", "fourth", "zero"]);
});

test("growth awards separate percentage increase from added minutes and exclude zero baselines", () => {
  const reveal = buildWeeklyReveal(team, week, [
    athlete("zero-baseline", 900, 0),
    athlete("most-added", 600, 400),
    athlete("most-improved", 150, 50),
    athlete("unchanged", 500, 500),
    athlete("less", 490, 500),
  ]);
  assert.equal(reveal.mostImproved?.athleteId, "most-improved");
  assert.equal(reveal.mostImproved?.percentChange, 200);
  assert.equal(reveal.mostAdded?.athleteId, "most-added");
  assert.equal(reveal.mostAdded.totalMinutes - reveal.mostAdded.previousWeekMinutes, 200);
});

test("award ties use podium ordering and the same athlete may win both awards", () => {
  const reveal = buildWeeklyReveal(team, week, [athlete("b", 200, 100), athlete("a", 200, 100)]);
  assert.equal(reveal.mostImproved?.athleteId, "a");
  assert.equal(reveal.mostAdded?.athleteId, "a");
});

test("missed targets and zero minutes exclude exemptions and preserve a zero-target distinction", () => {
  const reveal = buildWeeklyReveal(team, week, [
    athlete("missed", 25, 0, { missingMinutes: true, status: "NOT_MET" }),
    athlete("zero", 0, 0, { missingMinutes: true, status: "NOT_MET" }),
    athlete("exempt", 0, 0, { status: "EXEMPT" }),
    athlete("zero-target", 0, 0),
  ]);
  assert.equal(reveal.missedTargetCount, 2);
  assert.equal(reveal.zeroMinutesCount, 2);
  assert.equal(reveal.athleteCount, 4);
  assert.equal(reveal.podium.length, 1);
  assert.equal(reveal.mostAdded, null);
  assert.equal(reveal.mostImproved, null);
});

test("empty and all-zero teams do not invent podium winners or improvements", () => {
  for (const rows of [[], [athlete("zero", 0, 0)]]) {
    const reveal = buildWeeklyReveal(team, week, rows);
    assert.deepEqual(reveal.podium, []);
    assert.equal(reveal.mostImproved, null);
    assert.equal(reveal.mostAdded, null);
  }
});

test("recap week dates retain the DST-aware existing boundary", () => {
  assert.equal(buildWeeklyReveal(team, new Date("2026-03-02T01:00:00.000Z"), []).weekEndAt.toISOString(), "2026-03-09T00:00:00.000Z");
  assert.equal(buildWeeklyReveal(team, new Date("2026-10-26T00:00:00.000Z"), []).weekEndAt.toISOString(), "2026-11-02T01:00:00.000Z");
});
