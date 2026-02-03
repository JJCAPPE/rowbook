import { getPreviousWeekStartAt } from "@rowbook/shared";
import { PrismaClient } from "@prisma/client";
import { getTeamLeaderboard, getTeamStats } from "../server/services/weekly-service";
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

  const recapWeekStart = getPreviousWeekStartAt(new Date());
  console.log(`Recap week start: ${recapWeekStart.toISOString()}`);

  const [leaderboard, teamStats] = await Promise.all([
    getTeamLeaderboard(team.id, recapWeekStart),
    getTeamStats(team.id, recapWeekStart),
  ]);

  const html = buildLeaderboardEmailHtml(team.name, leaderboard, teamStats);
  
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
