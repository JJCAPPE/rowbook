import { PrismaClient } from "@prisma/client";
import { getPreviousWeekStartAt, getWeekStartAt } from "@rowbook/shared";

import { buildLeaderboardEmailHtml } from "../../apps/web/src/server/jobs/weekly-aggregation.ts";
import { listTeams } from "../../apps/web/src/server/repositories/teams.ts";
import { sendEmail } from "../../apps/web/src/server/services/email-service.ts";
import { getTeamLeaderboard, getTeamStats } from "../../apps/web/src/server/services/weekly-service.ts";

const prisma = new PrismaClient();

const main = async () => {
  console.log("Starting recap email manual script...");
  const teams = await listTeams();
  if (teams.length === 0) {
    throw new Error("No teams found.");
  }

  const team = teams[0]!;
  const recapWeekStart = getWeekStartAt(new Date());
  const [leaderboard, teamStats, previousTeamStats] = await Promise.all([
    getTeamLeaderboard(team.id, recapWeekStart),
    getTeamStats(team.id, recapWeekStart),
    getTeamStats(team.id, getPreviousWeekStartAt(recapWeekStart)),
  ]);

  const recipients = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ athleteProfile: { teamId: team.id } }, { role: "COACH" }],
    },
    select: { email: true },
  });
  const recipientEmails = [...new Set(recipients.map((user) => user.email))];
  if (!recipientEmails.length) {
    throw new Error("No recipients found.");
  }

  const result = await sendEmail({
    to: recipientEmails,
    subject: `${team.name} Weekly Recap as of ${recapWeekStart.toISOString().slice(0, 10)}`,
    html: buildLeaderboardEmailHtml(team.name, leaderboard, teamStats, previousTeamStats),
  });
  console.log("Send result:", result);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
