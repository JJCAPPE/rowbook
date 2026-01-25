import { getWeekEndAt, getWeekRange } from "@rowbook/shared";
import { getDefaultTeam } from "@/server/repositories/teams";
import { getLeaderboardForWeek } from "@/server/services/weekly-service";
import { listEntriesByAthlete } from "@/server/repositories/training-entries";
import { listWeeklyAggregatesByAthlete } from "@/server/repositories/weekly-aggregates";

export const getTeamOverview = async (teamId?: string, weekStartAt?: Date) => {
  const team = teamId ? { id: teamId } : await getDefaultTeam();
  if (!team) {
    throw new Error("Team not found.");
  }

  const week = weekStartAt ?? getWeekRange(new Date()).weekStartAt;
  const weekEndAt = getWeekEndAt(week);

  const leaderboard = await getLeaderboardForWeek(team.id, week);
  const summary = leaderboard.reduce(
    (acc, row) => {
      if (row.status === "MET") acc.met += 1;
      if (row.status === "NOT_MET") acc.notMet += 1;
      if (row.status === "EXEMPT") acc.exempt += 1;
      return acc;
    },
    { met: 0, notMet: 0, exempt: 0 },
  );

  return {
    teamId: team.id,
    weekStartAt: week,
    weekEndAt,
    summary,
    leaderboard,
  };
};

export const getAthleteDetail = async (athleteId: string) => {
  const [entries, history] = await Promise.all([
    listEntriesByAthlete(athleteId),
    listWeeklyAggregatesByAthlete(athleteId),
  ]);

  return {
    entries,
    history,
  };
};
