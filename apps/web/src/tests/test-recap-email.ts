import { getPreviousWeekStartAt, getWeekStartAt } from "@rowbook/shared";
import { listTeams } from "../server/repositories/teams";
import { getTeamLeaderboard, getTeamStats } from "../server/services/weekly-service";
import { sendEmail } from "../server/services/email-service";
import { buildLeaderboardEmailHtml } from "../server/jobs/weekly-aggregation";
import { PrismaClient } from "@prisma/client";

/**
 * Script version of the API test recap.
 * Can be run with: npx tsx --env-file=.env src/tests/test-recap-email.ts
 */
const prisma = new PrismaClient();

async function main() {
  const targetEmail = "bujack@bu.edu";

  console.log("Starting email recap test script...");
  
  const teams = await listTeams();
  if (teams.length === 0) {
    console.error("No teams found");
    return;
  }

  const team = teams[0]!;
  console.log(`Using team: ${team.name}`);
  
  const recapWeekStart = getWeekStartAt(new Date());

  const [leaderboard, teamStats, previousTeamStats] = await Promise.all([
    getTeamLeaderboard(team.id, recapWeekStart),
    getTeamStats(team.id, recapWeekStart),
    getTeamStats(team.id, getPreviousWeekStartAt(recapWeekStart)),
  ]);

  console.log(`Sending test email to: ${targetEmail}`);

  const result = await sendEmail({
    to: [targetEmail],
    subject: `[TEST] ${team.name} Weekly Recap as of ${recapWeekStart.toISOString().split("T")[0]}`,
    html: buildLeaderboardEmailHtml(team.name, leaderboard, teamStats, previousTeamStats),
  });

  console.log("Send result:", result);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
