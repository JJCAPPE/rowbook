import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { getPreviousWeekStartAt, getWeekStartAt } from "@rowbook/shared";

import { buildLeaderboardEmailHtml } from "../../apps/web/src/server/jobs/weekly-aggregation.ts";
import { getTeamLeaderboard, getTeamStats, getTeamTrend } from "../../apps/web/src/server/services/weekly-service.ts";

const prisma = new PrismaClient();

const main = async () => {
  console.log("Starting recap HTML manual script...");
  const team = await prisma.team.findFirst();
  if (!team) {
    throw new Error("No teams found.");
  }

  const weekStart = getWeekStartAt(new Date());
  const [leaderboard, teamStats, previousTeamStats, teamTrend] = await Promise.all([
    getTeamLeaderboard(team.id, weekStart),
    getTeamStats(team.id, weekStart),
    getTeamStats(team.id, getPreviousWeekStartAt(weekStart)),
    getTeamTrend(team.id, weekStart, 6),
  ]);

  const html = buildLeaderboardEmailHtml(
    team.name,
    leaderboard,
    teamStats,
    previousTeamStats,
    teamTrend,
  );

  const outputPath = path.join(import.meta.dirname, "test-recap-output.html");
  fs.writeFileSync(outputPath, html);
  console.log(`Saved to ${outputPath}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
