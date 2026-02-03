import { getPreviousWeekStartAt, getWeekStartAt } from "@rowbook/shared";
import { prisma } from "@/db/client";
import { listTeams } from "@/server/repositories/teams";
import { aggregateWeekForTeam } from "@/server/services/weekly-service";
import { sendEmail } from "@/server/services/email-service";
import { DateTime } from "luxon";

type WeeklyAggregationOptions = {
  weeks?: number;
  sendEmails?: boolean;
};

const buildWeekStarts = (weeks: number) => {
  const weekStarts: Date[] = [];
  let current = getWeekStartAt(new Date());

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
  const weeks = Math.max(1, options.weeks ?? 6);
  const sendEmails = options.sendEmails ?? true;
  const weekStarts = buildWeekStarts(weeks);
  const recapWeekStart = getPreviousWeekStartAt(new Date());
  
  const teams = await listTeams();
  const results: Array<{ teamId: string; aggregateCount: number; weeks: number }> = [];

  // Recaps are only sent on Sunday at 8 PM America/New_York
  const now = DateTime.now().setZone("America/New_York");
  const isEmailWindow = now.weekday === 7 && now.hour === 20;

  for (const team of teams) {
    let aggregateCount = 0;

    for (const weekStartAt of weekStarts) {
      const aggregates = await aggregateWeekForTeam(team.id, weekStartAt);
      aggregateCount += aggregates.length;

      const isRecapWeek = weekStartAt.getTime() === recapWeekStart.getTime();

      if (sendEmails && isRecapWeek && isEmailWindow) {
        const recipients: Array<{ email: string }> = await prisma.user.findMany({
          where: { 
            status: "ACTIVE",
            OR: [
              { athleteProfile: { teamId: team.id } },
              { role: "COACH" } // Coaches usually want to see the recap too
            ]
          },
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

