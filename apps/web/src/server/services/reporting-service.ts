import { getWeekEndAt, getWeekStartAt } from "@rowbook/shared";
import { listTeamAthletes } from "@/server/repositories/users";
import {
  getTeamLeaderboard,
  getTeamTrend,
} from "@/server/services/weekly-service";

const csvCell = (value: string | number) => {
  let text = String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const getTeamTrends = async (teamId: string, limit = 12) => {
  const boundedLimit = Math.min(52, Math.max(1, Math.floor(limit)));
  const currentWeekStartAt = getWeekStartAt(new Date());
  const [trend, athletes] = await Promise.all([
    getTeamTrend(teamId, currentWeekStartAt, boundedLimit),
    listTeamAthletes(teamId),
  ]);

  return trend
    .map((week) => ({
      weekStartAt: week.weekStartAt,
      weekEndAt: getWeekEndAt(week.weekStartAt),
      totalMinutes: week.minutes,
      athleteCount: athletes.length,
    }))
    .reverse();
};

export const exportWeeklyCsv = async (teamId: string, weekStartAt: Date) => {
  const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
  const weekEndAt = getWeekEndAt(normalizedWeekStartAt);
  const leaderboard = await getTeamLeaderboard(teamId, normalizedWeekStartAt);

  const header = [
    "athlete_id",
    "athlete_name",
    "total_minutes",
    "status",
    "week_start_at",
    "week_end_at",
  ].map(csvCell).join(",");

  const rows = leaderboard.map((row) =>
    [
      row.athleteId,
      row.name,
      row.totalMinutes,
      row.status,
      normalizedWeekStartAt.toISOString(),
      weekEndAt.toISOString(),
    ].map(csvCell).join(","),
  );

  return [header, ...rows].join("\n");
};
