import { getPreviousWeekStartAt } from "@rowbook/shared";
import { prisma } from "@/db/client";
import { listTeams } from "@/server/repositories/teams";
import { aggregateWeekForTeam } from "@/server/services/weekly-service";
import { sendEmail } from "@/server/services/email-service";

const buildLeaderboardHtml = (teamName: string, rows: Array<{
  athleteId: string;
  totalMinutes: number;
  status: string;
}>) => {
  const lines = rows
    .map(
      (row) =>
        `<tr><td>${row.athleteId}</td><td>${row.totalMinutes}</td><td>${row.status}</td></tr>`,
    )
    .join("");

  return `
    <h2>${teamName} Weekly Leaderboard</h2>
    <table>
      <thead><tr><th>Athlete</th><th>Minutes</th><th>Status</th></tr></thead>
      <tbody>${lines}</tbody>
    </table>
  `;
};

export const runWeeklyAggregation = async () => {
  const weekStartAt = getPreviousWeekStartAt(new Date());
  const teams = await listTeams();
  const results = [];

  for (const team of teams) {
    const aggregates = await aggregateWeekForTeam(team.id, weekStartAt);
    const recipients = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { email: true },
    });

    if (recipients.length > 0) {
      await sendEmail({
        to: recipients.map((user) => user.email),
        subject: `${team.name} weekly recap`,
        html: buildLeaderboardHtml(team.name, aggregates),
      });
    }

    results.push({ teamId: team.id, aggregateCount: aggregates.length });
  }

  return { weekStartAt, results };
};
