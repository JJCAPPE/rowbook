import { getPreviousWeekStartAt, getWeekStartAt, WeeklyStatus, ActivityType } from "@rowbook/shared";
import { prisma } from "@/db/client";
import { listTeams } from "@/server/repositories/teams";
import { aggregateWeekForTeam, getTeamLeaderboard, getTeamStats, getTeamTrend } from "@/server/services/weekly-service";
import { sendEmail } from "@/server/services/email-service";
import { DateTime } from "luxon";

type WeeklyAggregationOptions = {
  weeks?: number;
  sendEmails?: boolean;
};

type LeaderboardRow = {
  id: string;
  athleteId: string;
  name: string;
  totalMinutes: number;
  status: WeeklyStatus;
  activityTypes: ActivityType[];
  hasHr: boolean;
  missingProof?: boolean;
  pendingProof?: boolean;
  missingMinutes?: boolean;
  totalDistance: number;
  avgHr: number | null;
  previousWeekMinutes: number;
};

type TeamStats = {
  totalMinutes: number;
  totalDistance: number;
  avgHr: number | null;
};

type TeamTrend = {
  weekStartAt: Date;
  minutes: number;
  distance: number;
  avgHr: number | null;
}[];

const buildWeekStarts = (weeks: number) => {
  const weekStarts: Date[] = [];
  let current = getWeekStartAt(new Date());

  for (let index = 0; index < weeks; index += 1) {
    weekStarts.push(current);
    current = getPreviousWeekStartAt(current);
  }

  return weekStarts;
};

const getTrend = (current: number, previous: number) => {
  if (previous === 0) {
    if (current > 0) return { percent: 100, direction: "up" as const };
    return { percent: 0, direction: "neutral" as const };
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  return {
    percent: Math.abs(percent),
    direction: percent > 0 ? "up" as const : percent < 0 ? "down" as const : "neutral" as const
  };
};

const formatDistance = (meters: number) => {
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
};

const statusLabels: Record<WeeklyStatus, string> = {
  MET: "✓ Met",
  NOT_MET: "✗ Not Met",
  EXEMPT: "— Exempt",
};

const statusColors: Record<WeeklyStatus, string> = {
  MET: "#10b981", // emerald
  NOT_MET: "#f43f5e", // rose
  EXEMPT: "#71717a", // zinc
};

const statusBackgrounds: Record<WeeklyStatus, string> = {
  MET: "#d1fae5", // emerald-100  
  NOT_MET: "#ffe4e6", // rose-100
  EXEMPT: "#f4f4f5", // zinc-100
};

const activityIcons: Record<ActivityType, string> = {
  ERG: "🚣",
  RUN: "🏃",
  CYCLE: "🚴",
  SWIM: "🏊",
  OTHER: "💪",
};

/**
 * Builds leaderboard HTML that matches the athlete leaderboard page exactly.
 * Reuses the same data structure from getTeamLeaderboard().
 */
export const buildLeaderboardEmailHtml = (
  teamName: string,
  rows: LeaderboardRow[],
  teamStats: TeamStats,
  teamTrend?: TeamTrend,
) => {
  // Filter out exempt athletes for the main list (matching page behavior when "Hide exempt" is on)
  const visibleRows = rows.filter(row => row.status !== "EXEMPT");

  // Build team trend summary
  const trendSummary = teamTrend && teamTrend.length > 0
    ? teamTrend.map((week, idx) => {
        const date = new Date(week.weekStartAt);
        const shortDate = `${date.getMonth() + 1}/${date.getDate()}`;
        const isLast = idx === teamTrend.length - 1;
        return `${shortDate}: ${week.minutes} min${isLast ? "" : " • "}`;
      }).join("")
    : "";

  const athleteRows = visibleRows
    .map((row, index) => {
      const trend = getTrend(row.totalMinutes, row.previousWeekMinutes);
      const trendHtml = trend.direction !== "neutral"
        ? `<span style="color: ${trend.direction === "up" ? "#10b981" : "#f43f5e"}; font-size: 11px; margin-left: 4px;">
             ${trend.direction === "up" ? "▲" : "▼"} ${trend.percent}%
           </span>`
        : "";

      const activityIconsHtml = row.activityTypes
        .map(type => activityIcons[type] || "")
        .join(" ");

      return `
        <div style="background-color: ${statusBackgrounds[row.status]}; border-radius: 12px; padding: 16px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-weight: 600; color: #71717a; font-size: 14px;">#${index + 1}</span>
            <div>
              <div style="font-weight: 600; color: #18181b; font-size: 14px;">${row.name}</div>
              <div style="font-size: 12px; color: #71717a; margin-top: 4px;">
                <span style="font-weight: 600; color: #18181b;">${row.totalMinutes} min</span>
                ${trendHtml}
                <span style="margin: 0 6px;">•</span>
                <span>${formatDistance(row.totalDistance)}</span>
                <span style="margin: 0 6px;">•</span>
                <span>${row.avgHr ? `${Math.round(row.avgHr)} bpm` : "— bpm"}</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">${activityIconsHtml}</span>
            <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; color: white; background-color: ${statusColors[row.status]};">
              ${statusLabels[row.status]}
            </span>
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; padding: 20px; margin: 0;">
      <div style="max-width: 700px; margin: 0 auto; background-color: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h1 style="margin: 0 0 8px 0; font-size: 24px; color: #18181b;">${teamName} Weekly Recap</h1>
        <p style="margin: 0 0 24px 0; color: #71717a;">See how the team performed this week.</p>

        <!-- Team Stats -->
        <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 150px; background-color: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 12px; color: #71717a; text-transform: uppercase; margin-bottom: 4px;">Minutes</div>
            <div style="font-size: 24px; font-weight: 700; color: #18181b;">${teamStats.totalMinutes.toLocaleString()} min</div>
          </div>
          <div style="flex: 1; min-width: 150px; background-color: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 12px; color: #71717a; text-transform: uppercase; margin-bottom: 4px;">Distance</div>
            <div style="font-size: 24px; font-weight: 700; color: #18181b;">${formatDistance(teamStats.totalDistance)}</div>
          </div>
          <div style="flex: 1; min-width: 150px; background-color: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 12px; color: #71717a; text-transform: uppercase; margin-bottom: 4px;">Avg HR</div>
            <div style="font-size: 24px; font-weight: 700; color: #18181b;">${teamStats.avgHr ? `${Math.round(teamStats.avgHr)} bpm` : "—"}</div>
          </div>
        </div>

        ${trendSummary ? `
        <!-- Team Progress -->
        <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <div style="font-size: 12px; color: #71717a; text-transform: uppercase; margin-bottom: 8px;">Team Progress (Last ${teamTrend?.length || 6} Weeks)</div>
          <div style="font-size: 13px; color: #52525b;">${trendSummary}</div>
        </div>
        ` : ""}

        <!-- Leaderboard -->
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 16px 0; font-size: 18px; color: #18181b;">Weekly Leaderboard</h2>
          ${athleteRows}
        </div>

        <p style="margin: 24px 0 0 0; font-size: 12px; color: #a1a1aa; text-align: center;">
          This is an automated weekly recap from RowBook.
        </p>
      </div>
    </body>
    </html>
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
          // Use the same data fetching as the leaderboard page
          const [leaderboard, teamStats, teamTrend] = await Promise.all([
            getTeamLeaderboard(team.id, recapWeekStart),
            getTeamStats(team.id, recapWeekStart),
            getTeamTrend(team.id, recapWeekStart, 6),
          ]);

          await sendEmail({
            to: recipients.map((user) => user.email),
            subject: `${team.name} weekly recap`,
            html: buildLeaderboardEmailHtml(team.name, leaderboard, teamStats, teamTrend),
          });
        }
      }
    }

    results.push({ teamId: team.id, aggregateCount, weeks });
  }

  return { results };
};

