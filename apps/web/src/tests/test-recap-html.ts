import { getWeekStartAt, getPreviousWeekStartAt } from "@rowbook/shared";
import { PrismaClient } from "@prisma/client";
import {
  getTeamLeaderboard,
  getTeamStats,
  getTeamTrend,
} from "../server/services/weekly-service";
import { buildLeaderboardEmailHtml } from "../server/jobs/weekly-aggregation";
import * as fs from "fs";
import * as path from "path";

/**
 * Script to generate the recap HTML for manual verification.
 * Run with: npx tsx --env-file=.env src/tests/test-recap-html.ts
 */
const prisma = new PrismaClient();

async function main() {
  console.log("Starting test email HTML generation...");

  const teams = await prisma.team.findMany();
  if (teams.length === 0) {
    console.error("No teams found in database.");
    process.exit(1);
  }

  const team = teams[0]!;
  console.log(`Using team: ${team.name} (${team.id})`);

  // Use current week (same as app leaderboard page)
  const weekStart = getWeekStartAt(new Date("2026-02-22T23:00:00.000Z"));
  console.log(`Week start: ${weekStart.toISOString()}`);

  const [leaderboard, teamStats, previousTeamStats, teamTrend] =
    await Promise.all([
      getTeamLeaderboard(team.id, weekStart),
      getTeamStats(team.id, weekStart),
      getTeamStats(team.id, getPreviousWeekStartAt(weekStart)),
      getTeamTrend(team.id, weekStart, 6),
    ]);

  console.log(`Leaderboard rows: ${leaderboard.length}`);
  console.log(`Team stats: ${JSON.stringify(teamStats)}`);

  const html = buildLeaderboardEmailHtml(
    team.name,
    leaderboard,
    teamStats,
    previousTeamStats,
    teamTrend,
  );

  const outputPath = path.join(__dirname, "test-recap-output.html");
  fs.writeFileSync(outputPath, html);

  console.log(`HTML generated successfully and saved to: ${outputPath}`);
}

main()
  .catch((e) => {
    console.error("Error generating test email HTML:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
