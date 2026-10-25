import { getPreviousWeekStartAt, getWeekEndAt } from "@rowbook/shared";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/db/client";
import type { WeeklyReveal } from "@/lib/weekly-reveal";
import type { SessionUser } from "@/server/context";
import { getTeamLeaderboard } from "@/server/services/weekly-service";

const WEEKLY_REVEAL_LAUNCH_AT = new Date("2026-10-26T00:00:00.000Z");

type RevealRow = Pick<
  Awaited<ReturnType<typeof getTeamLeaderboard>>[number],
  | "athleteId"
  | "name"
  | "totalMinutes"
  | "previousWeekMinutes"
  | "activityTypes"
  | "avgHr"
  | "status"
  | "missingMinutes"
>;

export const buildWeeklyReveal = (
  team: { id: string; name: string },
  weekStartAt: Date,
  rows: RevealRow[],
): WeeklyReveal => {
  const ranked = [...rows]
    .sort(
      (left, right) =>
        right.totalMinutes - left.totalMinutes ||
        left.name.localeCompare(right.name, "en") ||
        left.athleteId.localeCompare(right.athleteId, "en"),
    )
    .map((row, index) => ({
      athleteId: row.athleteId,
      name: row.name,
      totalMinutes: row.totalMinutes,
      previousWeekMinutes: row.previousWeekMinutes,
      activityTypes: row.activityTypes,
      avgHr: row.avgHr,
      percentChange:
        row.previousWeekMinutes > 0
          ? ((row.totalMinutes - row.previousWeekMinutes) / row.previousWeekMinutes) * 100
          : null,
      rank: index + 1,
    }));
  const improved = ranked.filter(
    (row) => row.previousWeekMinutes > 0 && row.totalMinutes > row.previousWeekMinutes,
  );
  const mostImproved = [...improved].sort(
    (left, right) => (right.percentChange ?? 0) - (left.percentChange ?? 0) || left.rank - right.rank,
  )[0] ?? null;
  const mostAdded = [...improved].sort(
    (left, right) =>
      (right.totalMinutes - right.previousWeekMinutes) -
        (left.totalMinutes - left.previousWeekMinutes) || left.rank - right.rank,
  )[0] ?? null;

  return {
    teamId: team.id,
    teamName: team.name,
    weekStartAt,
    weekEndAt: getWeekEndAt(weekStartAt),
    podium: ranked.filter((row) => row.totalMinutes > 0).slice(0, 3),
    mostImproved,
    mostAdded,
    missedTargetCount: rows.filter((row) => row.status !== "EXEMPT" && row.missingMinutes).length,
    zeroMinutesCount: rows.filter((row) => row.status !== "EXEMPT" && row.totalMinutes === 0).length,
    athleteCount: rows.length,
  };
};

const authorizedTeamWhere = (user: SessionUser, teamId?: string) => {
  if (user.status !== "ACTIVE") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return {
    ...(teamId ? { id: teamId } : {}),
    ...(user.role === "ATHLETE"
      ? { athletes: { some: { userId: user.id } } }
      : { coaches: { some: { coachId: user.id } } }),
  };
};

export const getPendingWeeklyReveal = async (
  user: SessionUser,
  teamId?: string,
  now = new Date(),
): Promise<WeeklyReveal | null> => {
  if (now < WEEKLY_REVEAL_LAUNCH_AT) return null;
  const weekStartAt = getPreviousWeekStartAt(now);
  const team = await prisma.team.findFirst({
    where: {
      ...authorizedTeamWhere(user, teamId),
      weeklyRevealSeen: { none: { userId: user.id, weekStartAt } },
    },
    select: { id: true, name: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!team) return null;

  return buildWeeklyReveal(team, weekStartAt, await getTeamLeaderboard(team.id, weekStartAt));
};

export const completeWeeklyReveal = async (
  user: SessionUser,
  input: { teamId?: string; weekStartAt: Date },
  now = new Date(),
) => {
  const weekStartAt = getPreviousWeekStartAt(now);
  if (now < WEEKLY_REVEAL_LAUNCH_AT || input.weekStartAt.getTime() !== weekStartAt.getTime()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This weekly recap is not available." });
  }
  const team = await prisma.team.findFirst({
    where: authorizedTeamWhere(user, input.teamId),
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (!team) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  await prisma.weeklyRevealSeen.createMany({
    data: { userId: user.id, teamId: team.id, weekStartAt },
    skipDuplicates: true,
  });
  return { success: true };
};
