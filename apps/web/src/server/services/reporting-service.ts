import { prisma } from "@/db/client";

export const getTeamTrends = async (teamId: string, limit = 12) => {
  const groupedResult = await prisma.weeklyAggregate.groupBy({
    by: ["weekStartAt", "weekEndAt"],
    where: { teamId },
    _sum: { totalMinutes: true },
    _count: { athleteId: true },
    orderBy: { weekStartAt: "desc" },
    take: limit,
  });
  const grouped = groupedResult as Array<{
    weekStartAt: Date;
    weekEndAt: Date;
    _sum: { totalMinutes: number | null };
    _count: { athleteId: number };
  }>;

  return grouped.map((row) => ({
    weekStartAt: row.weekStartAt,
    weekEndAt: row.weekEndAt,
    totalMinutes: row._sum.totalMinutes ?? 0,
    athleteCount: row._count.athleteId,
  }));
};

export const exportWeeklyCsv = async (teamId: string, weekStartAt: Date) => {
  const aggregatesResult = await prisma.weeklyAggregate.findMany({
    where: { teamId, weekStartAt },
    include: { athlete: true },
    orderBy: { totalMinutes: "desc" },
  });
  const aggregates = aggregatesResult as Array<{
    athleteId: string;
    totalMinutes: number;
    status: string;
    weekStartAt: Date;
    weekEndAt: Date;
    athlete: { name: string | null };
  }>;

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
