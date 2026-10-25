import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";
import { getPreviousWeekStartAt, getWeekEndAt } from "@rowbook/shared";

const databaseUrl = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) &&
    ["/rowbook_season_test", "/rowbook_weekly_reveal_test"].includes(databaseUrl.pathname),
  "Weekly reveal integration tests require a local rowbook_season_test or rowbook_weekly_reveal_test database.",
);

const { prisma } = await import("../../apps/web/src/db/client.ts");
const { getPendingWeeklyReveal, completeWeeklyReveal } = await import("../../apps/web/src/server/services/weekly-reveal-service.ts");
const { weeklyRevealRouter } = await import("../../apps/web/src/server/routers/weekly-reveal.ts");

test("weekly reveal uses real team data, scoped authorization, and durable acknowledgments", async (t) => {
  const now = new Date("2026-10-26T12:00:00.000Z");
  const weekStartAt = getPreviousWeekStartAt(now);
  const previousWeekStartAt = getPreviousWeekStartAt(weekStartAt);
  const teamIds = [randomUUID(), randomUUID(), randomUUID()];
  const users = Object.fromEntries(
    ["alice", "bob", "carol", "partial", "zero", "exempt", "zero-target", "inactive", "coach", "admin"].map((name) => [name, {
      id: randomUUID(), email: `${randomUUID()}@example.test`, name,
      role: name === "coach" ? "COACH" as const : name === "admin" ? "ADMIN" as const : "ATHLETE" as const,
      status: name === "inactive" ? "INACTIVE" as const : "ACTIVE" as const,
    }]),
  );
  const userIds = Object.values(users).map((user) => user.id);
  const unauthorized = { req: new Request("http://localhost/api/trpc"), responseHeaders: {}, setCookie: () => undefined, session: null };

  try {
    await prisma.team.createMany({ data: teamIds.map((id, index) => ({ id, name: `Reveal test ${index}`, createdAt: new Date(2020, 0, index + 1) })) });
    await prisma.user.createMany({ data: Object.values(users) });
    await prisma.athleteProfile.createMany({ data: Object.values(users).filter((user) => user.role === "ATHLETE").map((user) => ({ userId: user.id, teamId: teamIds[0] })) });
    await prisma.coachTeamMembership.createMany({ data: [
      { coachId: users.coach.id, teamId: teamIds[0] },
      { coachId: users.coach.id, teamId: teamIds[1] },
      { coachId: users.admin.id, teamId: teamIds[0] },
    ] });
    await prisma.weeklyRequirement.create({ data: { teamId: teamIds[0], weekStartAt, weekEndAt: getWeekEndAt(weekStartAt), requiredMinutes: 200 } });
    await prisma.athleteWeeklyRequirementOverride.create({ data: { athleteId: users["zero-target"].id, weekStartAt, requiredMinutes: 0, createdBy: users.coach.id } });
    await prisma.exemption.create({ data: { athleteId: users.exempt.id, weekStartAt, createdBy: users.coach.id } });
    const entry = (name: string, minutes: number, week: Date, avgHr: number | null = null) => ({
      athleteId: users[name].id, minutes, weekStartAt: week, date: week,
      activityType: "ERG" as const, distance: 0, avgHr,
      validationStatus: "VERIFIED" as const, creditPolicyVersion: 1,
    });
    await prisma.trainingEntry.createMany({ data: [
      entry("alice", 100, weekStartAt, 140),
      { ...entry("alice", 200, weekStartAt, 160), activityType: "RUN" },
      entry("alice", 200, previousWeekStartAt),
      entry("bob", 250, weekStartAt), entry("bob", 50, previousWeekStartAt),
      entry("carol", 200, weekStartAt),
      entry("partial", 50, weekStartAt), entry("partial", 100, previousWeekStartAt),
      entry("inactive", 9999, weekStartAt),
      { ...entry("zero", 9999, weekStartAt), validationStatus: "REJECTED" },
      entry("zero", 9999, getWeekEndAt(weekStartAt)),
    ] });

    await t.test("the prior completed week uses credited workouts, weighted HR, targets and exemptions", async () => {
      const recap = await getPendingWeeklyReveal(users.alice, undefined, now);
      assert.ok(recap);
      assert.equal(recap.weekStartAt.toISOString(), "2026-10-19T00:00:00.000Z");
      assert.equal(recap.weekEndAt.toISOString(), "2026-10-26T00:00:00.000Z");
      assert.deepEqual(recap.podium.map((row) => [row.name, row.totalMinutes]), [["alice", 300], ["bob", 250], ["carol", 200]]);
      assert.equal(recap.podium[0].avgHr, 153);
      assert.deepEqual(recap.podium[0].activityTypes.sort(), ["ERG", "RUN"]);
      assert.equal(recap.podium[0].percentChange, 50);
      assert.equal(recap.podium[2].percentChange, null);
      assert.equal(recap.mostImproved?.name, "bob");
      assert.equal(recap.mostImproved?.percentChange, 400);
      assert.equal(recap.mostAdded?.name, "bob");
      assert.equal(recap.missedTargetCount, 2);
      assert.equal(recap.zeroMinutesCount, 2);
      assert.equal(recap.athleteCount, 7);
      assert.equal(await prisma.weeklyRevealSeen.count({ where: { teamId: { in: teamIds } } }), 0);
      assert.ok(await getPendingWeeklyReveal(users.alice, undefined, now), "Fetching cannot mark the recap seen");
    });

    await t.test("anonymous and inactive users are rejected, and every role is team-scoped", async () => {
      const caller = weeklyRevealRouter.createCaller(unauthorized);
      await assert.rejects(caller.getPending(), { code: "UNAUTHORIZED" });
      await assert.rejects(caller.complete({ teamId: teamIds[0], weekStartAt }), { code: "UNAUTHORIZED" });
      for (const user of [users.alice, users.coach, users.admin]) {
        assert.equal(await getPendingWeeklyReveal(user, teamIds[2], now), null);
        await assert.rejects(completeWeeklyReveal(user, { teamId: teamIds[2], weekStartAt }, now), { code: "FORBIDDEN" });
        assert.ok(await getPendingWeeklyReveal(user, teamIds[0], now));
      }
      await assert.rejects(getPendingWeeklyReveal(users.inactive, undefined, now), { code: "FORBIDDEN" });
      await assert.rejects(completeWeeklyReveal(users.inactive, { teamId: teamIds[0], weekStartAt }, now), { code: "FORBIDDEN" });
      assert.equal(await prisma.weeklyRevealSeen.count({ where: { teamId: { in: teamIds } } }), 0);
    });

    await t.test("the first recap cannot be shown or completed before the launch boundary", async () => {
      const beforeLaunch = new Date("2026-10-25T23:59:59.999Z");
      for (const user of [users.alice, users.coach, users.admin]) {
        assert.equal(await getPendingWeeklyReveal(user, teamIds[0], beforeLaunch), null);
        for (const week of [getPreviousWeekStartAt(beforeLaunch), weekStartAt]) {
          await assert.rejects(completeWeeklyReveal(user, { teamId: teamIds[0], weekStartAt: week }, beforeLaunch), { code: "BAD_REQUEST" });
        }
      }
      assert.equal(await prisma.weeklyRevealSeen.count({ where: { teamId: { in: teamIds } } }), 0);
    });

    await t.test("server time rolls over exactly at Sunday 20:00, including both DST changes", async () => {
      for (const [at, expected] of [
        ["2026-10-26T00:00:00.000Z", "2026-10-19T00:00:00.000Z"],
        ["2026-11-02T00:59:59.999Z", "2026-10-19T00:00:00.000Z"],
        ["2026-11-02T01:00:00.000Z", "2026-10-26T00:00:00.000Z"],
        ["2027-03-14T23:59:59.999Z", "2027-03-01T01:00:00.000Z"],
        ["2027-03-15T00:00:00.000Z", "2027-03-08T01:00:00.000Z"],
      ]) {
        assert.equal((await getPendingWeeklyReveal(users.alice, undefined, new Date(at)))?.weekStartAt.toISOString(), expected);
      }
      for (const invalid of [previousWeekStartAt, getWeekEndAt(weekStartAt), new Date("2026-10-19T04:00:00.000Z")]) {
        await assert.rejects(completeWeeklyReveal(users.alice, { teamId: teamIds[0], weekStartAt: invalid }, now), { code: "BAD_REQUEST" });
      }
    });

    await t.test("completion is durable and concurrent retries are idempotent, scoped by user and week", async () => {
      await Promise.all(Array.from({ length: 6 }, () => completeWeeklyReveal(users.alice, { teamId: teamIds[0], weekStartAt }, now)));
      await prisma.$disconnect();
      assert.equal(await prisma.weeklyRevealSeen.count({ where: { userId: users.alice.id } }), 1);
      assert.equal(await getPendingWeeklyReveal(users.alice, undefined, now), null);
      assert.ok(await getPendingWeeklyReveal(users.bob, undefined, now));
      assert.ok(await getPendingWeeklyReveal(users.alice, undefined, new Date("2026-11-02T12:00:00.000Z")));
      const firstCompletedAt = (await prisma.weeklyRevealSeen.findFirstOrThrow({ where: { userId: users.alice.id } })).completedAt;
      await completeWeeklyReveal(users.alice, { teamId: teamIds[0], weekStartAt }, now);
      assert.deepEqual((await prisma.weeklyRevealSeen.findFirstOrThrow({ where: { userId: users.alice.id } })).completedAt, firstCompletedAt);
    });

    await t.test("a coach without an active team receives each unseen team; an empty team is valid", async () => {
      assert.equal((await getPendingWeeklyReveal(users.coach, undefined, now))?.teamId, teamIds[0]);
      await completeWeeklyReveal(users.coach, { teamId: teamIds[0], weekStartAt }, now);
      const next = await getPendingWeeklyReveal(users.coach, undefined, now);
      assert.equal(next?.teamId, teamIds[1]);
      assert.equal(next.athleteCount, 0);
      assert.deepEqual(next.podium, []);
      await completeWeeklyReveal(users.coach, { teamId: teamIds[1], weekStartAt }, now);
      assert.equal(await getPendingWeeklyReveal(users.coach, undefined, now), null);
    });
  } finally {
    await prisma.trainingEntry.deleteMany({ where: { athleteId: { in: userIds } } });
    await prisma.exemption.deleteMany({ where: { athleteId: { in: userIds } } });
    await prisma.athleteWeeklyRequirementOverride.deleteMany({ where: { athleteId: { in: userIds } } });
    await prisma.weeklyRequirement.deleteMany({ where: { teamId: { in: teamIds } } });
    await prisma.athleteProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
});
