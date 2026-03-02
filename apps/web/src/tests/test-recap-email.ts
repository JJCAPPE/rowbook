import { getPreviousWeekStartAt, getWeekStartAt } from "@rowbook/shared";
import { listTeams } from "../server/repositories/teams";
import {
  getTeamLeaderboard,
  getTeamStats,
  getTeamTrend,
} from "../server/services/weekly-service";
import { sendEmail } from "../server/services/email-service";
import { buildLeaderboardEmailHtml } from "../server/jobs/weekly-aggregation";
import { PrismaClient } from "@prisma/client";

/**
 * Script version of the API test recap.
 * Can be run with: npx tsx --env-file=.env src/tests/test-recap-email.ts
 */
const prisma = new PrismaClient();

async function main() {
  console.log("Starting email recap test script...");

  const teams = await listTeams();
  if (teams.length === 0) {
    console.error("No teams found");
    return;
  }

  const team = teams[0]!;
  console.log(`Using team: ${team.name}`);

  const recapWeekStart = getWeekStartAt(new Date("2026-03-01T23:00:00.000Z"));

  const [leaderboard, teamStats, previousTeamStats, teamTrend] = await Promise.all([
    getTeamLeaderboard(team.id, recapWeekStart),
    getTeamStats(team.id, recapWeekStart),
    getTeamStats(team.id, getPreviousWeekStartAt(recapWeekStart)),
    getTeamTrend(team.id, recapWeekStart, 6),
  ]);

  const recipients = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ athleteProfile: { teamId: team.id } }, { role: "COACH" }],
    },
    select: { email: true },
  });

  const recipientEmails = [...new Set(recipients.map((user) => user.email))];

  if (recipientEmails.length === 0) {
    console.error("No active athlete/coach recipients found");
    return;
  }

  console.log(
    `Sending final recap email to ${recipientEmails.length} recipients`,
  );

  const result = await sendEmail({
    to: recipientEmails,
    subject: `${team.name} Weekly Recap as of ${recapWeekStart.toISOString().split("T")[0]}`,
    html: buildLeaderboardEmailHtml(
      team.name,
      leaderboard,
      teamStats,
      previousTeamStats,
      teamTrend,
    ),
  });

  console.log("Send result:", result);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
