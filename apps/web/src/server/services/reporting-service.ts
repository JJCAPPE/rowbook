import { prisma } from "@/db/client";

export const getTeamTrends = async (teamId: string, limit = 12) => {
  const grouped = await prisma.weeklyAggregate.groupBy({
    by: ["weekStartAt", "weekEndAt"],
    where: { teamId },
    _sum: { totalMinutes: true },
    _count: { athleteId: true },
    orderBy: { weekStartAt: "desc" },
    take: limit,
  });

  return grouped.map((row) => ({
    weekStartAt: row.weekStartAt,
    weekEndAt: row.weekEndAt,
    totalMinutes: row._sum.totalMinutes ?? 0,
    athleteCount: row._count.athleteId,
  }));
};

export const exportWeeklyCsv = async (teamId: string, weekStartAt: Date) => {
  const aggregates = await prisma.weeklyAggregate.findMany({
    where: { teamId, weekStartAt },
    include: { athlete: true },
    orderBy: { totalMinutes: "desc" },
  });

  const header = [
    "athlete_id",
    "athlete_name",
    "total_minutes",
    "status",
    "week_start_at",
    "week_end_at",
  ].join(",");

  const rows = aggregates.map((row) =>
    [
      row.athleteId,
      row.athlete.name ?? "",
      row.totalMinutes,
      row.status,
      row.weekStartAt.toISOString(),
      row.weekEndAt.toISOString(),
    ].join(","),
  );

  return [header, ...rows].join("\n");
};
