import { getPreviousWeekStartAt } from "@rowbook/shared";
import { prisma } from "@/db/client";
import { listTeams } from "@/server/repositories/teams";
import { aggregateWeekForTeam } from "@/server/services/weekly-service";
import { sendEmail } from "@/server/services/email-service";

type WeeklyAggregationOptions = {
  weeks?: number;
  sendEmails?: boolean;
};

const buildWeekStarts = (weeks: number) => {
  const weekStarts: Date[] = [];
  let current = getPreviousWeekStartAt(new Date());

  for (let index = 0; index < weeks; index += 1) {
    weekStarts.push(current);
    current = getPreviousWeekStartAt(current);
  }

  return weekStarts;
};

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

export const runWeeklyAggregation = async (options: WeeklyAggregationOptions = {}) => {
  const weeks = Math.max(1, options.weeks ?? 1);
  const sendEmails = options.sendEmails ?? true;
  const weekStarts = buildWeekStarts(weeks);
  const latestWeekStart = weekStarts[0];
  const teams = await listTeams();
  const results: Array<{ teamId: string; aggregateCount: number; weeks: number }> = [];

  for (const team of teams) {
    let aggregateCount = 0;

    for (const weekStartAt of weekStarts) {
      const aggregates = await aggregateWeekForTeam(team.id, weekStartAt);
      aggregateCount += aggregates.length;

      if (sendEmails && weekStartAt.getTime() === latestWeekStart.getTime()) {
        const recipients: Array<{ email: string }> = await prisma.user.findMany({
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
      }
    }

    results.push({ teamId: team.id, aggregateCount, weeks });
  }

  return { results };
};
