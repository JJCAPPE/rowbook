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

type TeamEmailResult = {
  status: "sent" | "skipped" | "failed";
  reason:
    | "sent"
    | "emails-disabled"
    | "outside-email-window"
    | "recap-week-not-in-range"
    | "no-recipients"
    | "provider-error";
  recipientCount: number;
  error?: string;
};

type TeamAggregationResult = {
  teamId: string;
  aggregateCount: number;
  weeks: number;
  email: TeamEmailResult;
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
  requiredMinutes?: number;
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

type AthleteInsight = {
  title: string;
  athlete: string;
  stat: string;
  note: string;
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

const formatDistance = (km: number) => {
  return `${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  }).format(km)} km`;
};

const formatWeekLabel = (weekStartAt: Date) => {
  const date = new Date(weekStartAt);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

const escapeHtml = (text: string) => {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return text.replace(/[&<>"']/g, (char) => replacements[char] ?? char);
};

const statusLabels: Record<WeeklyStatus, string> = {
  MET: "✓ Met",
  NOT_MET: "✗ Not Met",
  EXEMPT: "— Exempt",
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
 * Builds leaderboard HTML for weekly recap emails.
 * Reuses leaderboard and trend data from weekly services.
 */
export const buildLeaderboardEmailHtml = (
  teamName: string,
  rows: LeaderboardRow[],
  teamStats: TeamStats,
  previousTeamStats: TeamStats,
  teamTrend?: TeamTrend,
) => {
  // Filter out exempt athletes for primary highlights and ranking views.
  const visibleRows = rows.filter((row) => row.status !== "EXEMPT");
  const activeRows = visibleRows.filter((row) => row.totalMinutes > 0);
  const trendRows = teamTrend ?? [];
  const maxTrendMinutes = Math.max(1, ...trendRows.map((week) => week.minutes));
  const targetMetCount = visibleRows.filter((row) => row.status === "MET").length;
  const completionRate =
    visibleRows.length > 0 ? Math.round((targetMetCount / visibleRows.length) * 100) : 0;
  const pendingProofCount = visibleRows.filter((row) => row.pendingProof).length;
  const rejectedProofCount = visibleRows.filter((row) => row.missingProof).length;
  const averageMinutesPerAthlete =
    visibleRows.length > 0
      ? Math.round(
          visibleRows.reduce((sum, row) => sum + row.totalMinutes, 0) / visibleRows.length,
        )
      : 0;

  const topVolumeRow = [...activeRows].sort((a, b) => b.totalMinutes - a.totalMinutes)[0];
  const distanceLeaderRow = [...activeRows].sort((a, b) => b.totalDistance - a.totalDistance)[0];
  const versatilityLeaderRow = [...activeRows].sort((a, b) => {
    const typeDifference = b.activityTypes.length - a.activityTypes.length;
    if (typeDifference !== 0) return typeDifference;
    return b.totalMinutes - a.totalMinutes;
  })[0];
  const biggestJumpCandidate = [...activeRows]
    .map((row) => ({ row, delta: row.totalMinutes - row.previousWeekMinutes }))
    .sort((a, b) => b.delta - a.delta)[0];

  const standoutInsights: AthleteInsight[] = [];
  if (topVolumeRow) {
    standoutInsights.push({
      title: "Top Volume",
      athlete: topVolumeRow.name,
      stat: `${topVolumeRow.totalMinutes} min`,
      note: `${formatDistance(topVolumeRow.totalDistance)} logged this week.`,
    });
  }
  if (biggestJumpCandidate && biggestJumpCandidate.delta > 0) {
    standoutInsights.push({
      title: "Biggest Week-Over-Week Jump",
      athlete: biggestJumpCandidate.row.name,
      stat: `+${biggestJumpCandidate.delta} min`,
      note: `${biggestJumpCandidate.row.previousWeekMinutes} -> ${biggestJumpCandidate.row.totalMinutes} minutes.`,
    });
  }
  if (distanceLeaderRow && distanceLeaderRow.totalDistance > 0) {
    standoutInsights.push({
      title: "Distance Leader",
      athlete: distanceLeaderRow.name,
      stat: formatDistance(distanceLeaderRow.totalDistance),
      note: `${distanceLeaderRow.totalMinutes} total minutes.`,
    });
  }
  if (versatilityLeaderRow && versatilityLeaderRow.activityTypes.length > 1) {
    standoutInsights.push({
      title: "Most Versatile",
      athlete: versatilityLeaderRow.name,
      stat: `${versatilityLeaderRow.activityTypes.length} activity types`,
      note: versatilityLeaderRow.activityTypes.join(" • "),
    });
  }

  const athleteRows = visibleRows
    .map((row, index) => {
      const trend = getTrend(row.totalMinutes, row.previousWeekMinutes);
      const trendHtml =
        trend.direction !== "neutral"
          ? `<span style="color: ${trend.direction === "up" ? "#10b981" : "#f43f5e"}; font-size: 11px; margin-left: 4px;">
             ${trend.direction === "up" ? "▲" : "▼"} ${trend.percent}%
           </span>`
          : "";

      const activityIconsHtml = row.activityTypes.map((type) => activityIcons[type] || "").join(" ");

      return `
        <div style="background-color: ${statusBackgrounds[row.status]}; border-radius: 16px; padding: 16px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; border: 1px solid rgba(0,0,0,0.03);">
          <div style="display: flex; align-items: center; gap: 16px;">
            <span style="font-weight: 600; color: #a1a1aa; font-size: 14px; min-width: 24px;">#${index + 1}</span>
            <div>
              <div style="font-weight: 600; color: #18181b; font-size: 15px;">${escapeHtml(row.name)}</div>
              <div style="font-size: 13px; color: #71717a; margin-top: 4px;">
                <span style="font-weight: 600; color: #18181b;">${row.totalMinutes} min</span>
                ${trendHtml}
                <span style="margin: 0 8px; color: #e4e4e7;">•</span>
                <span>${row.avgHr ? `${Math.round(row.avgHr)} bpm` : "— bpm"}</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-size: 16px; opacity: 0.8;">${activityIconsHtml}</span>
            <span style="display: inline-block; padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 600; color: ${row.status === 'MET' ? '#065F46' : row.status === 'NOT_MET' ? '#9F1239' : '#3F3F46'}; background-color: ${row.status === 'MET' ? '#D1FAE5' : row.status === 'NOT_MET' ? '#FFE4E6' : '#F4F4F5'};">
              ${statusLabels[row.status].replace(/^[^ ]+\s/, "")}
            </span>
          </div>
        </div>
      `;
    })
    .join("");

  const insightsHtml =
    standoutInsights.length > 0
      ? standoutInsights
          .map(
            (insight) => `
              <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 14px; padding: 14px; margin-bottom: 10px;">
                <div style="font-size: 11px; color: #52525b; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 6px;">${escapeHtml(insight.title)}</div>
                <div style="font-size: 16px; font-weight: 700; color: #18181b; margin-bottom: 4px;">${escapeHtml(insight.athlete)}</div>
                <div style="font-size: 13px; font-weight: 600; color: #0f766e; margin-bottom: 4px;">${escapeHtml(insight.stat)}</div>
                <div style="font-size: 12px; color: #52525b; line-height: 1.4;">${escapeHtml(insight.note)}</div>
              </div>
            `,
          )
          .join("")
      : `
          <div style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 14px; padding: 14px; color: #52525b; font-size: 13px;">
            No standout performances were detected this week yet. Once athletes log minutes, this section will highlight top movers automatically.
          </div>
        `;

  const progressionRowsHtml =
    trendRows.length > 0
      ? trendRows
          .map((week, index) => {
            const weekLabel = formatWeekLabel(week.weekStartAt);
            const widthPercent =
              week.minutes > 0 ? Math.max((week.minutes / maxTrendMinutes) * 100, 6) : 0;
            const previousWeek = index > 0 ? trendRows[index - 1] : null;
            const directionalTrend =
              previousWeek && previousWeek.minutes >= 0
                ? getTrend(week.minutes, previousWeek.minutes)
                : null;
            const trendLabel =
              directionalTrend && directionalTrend.direction !== "neutral"
                ? `${directionalTrend.direction === "up" ? "▲" : "▼"} ${directionalTrend.percent}%`
                : "—";

            return `
              <tr>
                <td style="padding: 8px 8px 8px 0; font-size: 12px; color: #52525b; white-space: nowrap;">${weekLabel}</td>
                <td style="padding: 8px;">
                  <div style="background-color: #e4e4e7; height: 10px; border-radius: 9999px; overflow: hidden;">
                    <div style="height: 10px; border-radius: 9999px; width: ${widthPercent.toFixed(1)}%; background-color: ${index === trendRows.length - 1 ? "#0f766e" : "#64748b"};"></div>
                  </div>
                </td>
                <td style="padding: 8px; text-align: right; font-size: 12px; color: #18181b; white-space: nowrap; font-weight: 600;">${week.minutes.toLocaleString()} min</td>
                <td style="padding: 8px 0 8px 8px; text-align: right; font-size: 12px; color: #52525b; white-space: nowrap;">${trendLabel}</td>
              </tr>
            `;
          })
          .join("")
      : `
          <tr>
            <td colspan="4" style="padding: 10px 0; font-size: 13px; color: #52525b;">
              Not enough weekly history yet to render a progression chart.
            </td>
          </tr>
        `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; padding: 20px; margin: 0;">
      <div style="max-width: 700px; margin: 0 auto; background-color: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <h1 style="margin: 0 0 8px 0; font-size: 24px; color: #18181b; text-align: center;">${escapeHtml(teamName)} Weekly Recap</h1>
        <p style="margin: 0 0 24px 0; color: #71717a; text-align: center;">See how the team performed this week.</p>

        <!-- Team Stats -->
        <div style="display: flex; gap: 12px; margin-bottom: 32px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 150px; background-color: #f4f4f5; border-radius: 16px; padding: 24px; text-align: center; border: 1px solid rgba(228, 228, 231, 0.4);">
            <div style="font-size: 11px; color: #71717a; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.2em; font-weight: 600;">Total Minutes</div>
            <div style="font-size: 30px; font-weight: 600; color: #18181b;">
              ${teamStats.totalMinutes.toLocaleString()} <span style="font-size: 16px; font-weight: 400; color: #71717a;">min</span>
            </div>
            ${(() => {
              const trend = getTrend(teamStats.totalMinutes, previousTeamStats.totalMinutes);
              if (trend.direction === "neutral") return "";
              const color = trend.direction === "up" ? "#10b981" : "#f43f5e";
              return `<div style="color: ${color}; font-size: 13px; font-weight: 600; margin-top: 4px;">${trend.direction === "up" ? "▲" : "▼"} ${trend.percent}%</div>`;
            })()}
          </div>
          <div style="flex: 1; min-width: 150px; background-color: #f4f4f5; border-radius: 16px; padding: 24px; text-align: center; border: 1px solid rgba(228, 228, 231, 0.4);">
            <div style="font-size: 11px; color: #71717a; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.2em; font-weight: 600;">Total Distance</div>
            <div style="font-size: 30px; font-weight: 600; color: #18181b;">
              ${formatDistance(teamStats.totalDistance).replace(" km", "")} <span style="font-size: 16px; font-weight: 400; color: #71717a;">km</span>
            </div>
            ${(() => {
              const trend = getTrend(teamStats.totalDistance, previousTeamStats.totalDistance);
              if (trend.direction === "neutral") return "";
              const color = trend.direction === "up" ? "#10b981" : "#f43f5e";
              return `<div style="color: ${color}; font-size: 13px; font-weight: 600; margin-top: 4px;">${trend.direction === "up" ? "▲" : "▼"} ${trend.percent}%</div>`;
            })()}
          </div>
          <div style="flex: 1; min-width: 150px; background-color: #f4f4f5; border-radius: 16px; padding: 24px; text-align: center; border: 1px solid rgba(228, 228, 231, 0.4);">
            <div style="font-size: 11px; color: #71717a; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.2em; font-weight: 600;">AVG HR</div>
            <div style="font-size: 30px; font-weight: 600; color: #18181b;">
              ${teamStats.avgHr ? Math.round(teamStats.avgHr) : "—"} <span style="font-size: 16px; font-weight: 400; color: #71717a;">bpm</span>
            </div>
            ${(() => {
              if (!teamStats.avgHr || !previousTeamStats.avgHr) return "";
              const trend = getTrend(teamStats.avgHr, previousTeamStats.avgHr);
              if (trend.direction === "neutral") return "";
              const color = trend.direction === "up" ? "#10b981" : "#f43f5e";
              return `<div style="color: ${color}; font-size: 13px; font-weight: 600; margin-top: 4px;">${trend.direction === "up" ? "▲" : "▼"} ${trend.percent}%</div>`;
            })()}
          </div>
        </div>

        <!-- Quick Insights -->
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #18181b;">Team Insights</h2>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;">
            <span style="display: inline-block; padding: 6px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background-color: #ecfeff; color: #0f766e;">${completionRate}% met target</span>
            <span style="display: inline-block; padding: 6px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background-color: #f4f4f5; color: #3f3f46;">${averageMinutesPerAthlete} avg min/athlete</span>
            <span style="display: inline-block; padding: 6px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background-color: #eff6ff; color: #1d4ed8;">${pendingProofCount} pending proof</span>
            <span style="display: inline-block; padding: 6px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background-color: #fff1f2; color: #be123c;">${rejectedProofCount} proof issues</span>
          </div>
          ${insightsHtml}
        </div>

        <!-- Progression -->
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #18181b;">Team Progression (Last ${trendRows.length > 0 ? trendRows.length : 0} Weeks)</h2>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
            <tbody>
              ${progressionRowsHtml}
            </tbody>
          </table>
        </div>

        <!-- Leaderboard -->
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600; color: #18181b;">Weekly Leaderboard</h2>
          <div style="display: flex; gap: 8px; margin-bottom: 16px;">
             <!-- Legend/Badges mockup could go here if needed, but skipping for cleanliness -->
          </div>
          ${athleteRows || `<div style="font-size: 13px; color: #52525b;">No non-exempt athletes found for this week.</div>`}
        </div>

        <p style="margin: 32px 0 0 0; font-size: 12px; color: #a1a1aa; text-align: center; border-top: 1px solid #e4e4e7; padding-top: 24px;">
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
  const recapWeekStartMs = recapWeekStart.getTime();
  
  const teams = await listTeams();
  const results: TeamAggregationResult[] = [];
  const weekStartSet = new Set(weekStarts.map((weekStartAt) => weekStartAt.getTime()));

  // Recaps are only sent on Sunday at 8 PM America/New_York
  const now = DateTime.now().setZone("America/New_York");
  const isEmailWindow = now.weekday === 7 && now.hour === 20;
  const emailWindow = {
    timezone: "America/New_York",
    now: now.toISO() ?? now.toString(),
    weekday: now.weekday,
    hour: now.hour,
    isOpen: isEmailWindow,
    recapWeekStart: recapWeekStart.toISOString(),
  };

  console.info("[weekly-aggregation] starting run", {
    weeks,
    sendEmails,
    teamCount: teams.length,
    emailWindow,
  });

  for (const team of teams) {
    let aggregateCount = 0;

    for (const weekStartAt of weekStarts) {
      const aggregates = await aggregateWeekForTeam(team.id, weekStartAt);
      aggregateCount += aggregates.length;
    }

    let email: TeamEmailResult;

    if (!sendEmails) {
      email = { status: "skipped", reason: "emails-disabled", recipientCount: 0 };
    } else if (!isEmailWindow) {
      email = { status: "skipped", reason: "outside-email-window", recipientCount: 0 };
    } else if (!weekStartSet.has(recapWeekStartMs)) {
      email = { status: "skipped", reason: "recap-week-not-in-range", recipientCount: 0 };
    } else {
      const recipients: Array<{ email: string }> = await prisma.user.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { athleteProfile: { teamId: team.id } },
            { role: "COACH" }, // Coaches usually want to see the recap too
          ],
        },
        select: { email: true },
      });
      const recipientEmails = [...new Set(recipients.map((user) => user.email))];

      if (recipientEmails.length === 0) {
        email = { status: "skipped", reason: "no-recipients", recipientCount: 0 };
      } else {
        try {
          // Use the same data fetching as the leaderboard page.
          const [leaderboard, teamStats, previousTeamStats, teamTrend] = await Promise.all([
            getTeamLeaderboard(team.id, recapWeekStart),
            getTeamStats(team.id, recapWeekStart),
            getTeamStats(team.id, getPreviousWeekStartAt(recapWeekStart)),
            getTeamTrend(team.id, recapWeekStart, 6),
          ]);

          await sendEmail({
            to: recipientEmails,
            subject: `${team.name} weekly recap`,
            html: buildLeaderboardEmailHtml(team.name, leaderboard, teamStats, previousTeamStats, teamTrend),
          });

          email = { status: "sent", reason: "sent", recipientCount: recipientEmails.length };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          email = {
            status: "failed",
            reason: "provider-error",
            recipientCount: recipientEmails.length,
            error: message,
          };
        }
      }
    }

    console.info("[weekly-aggregation] team result", {
      teamId: team.id,
      teamName: team.name,
      aggregateCount,
      emailStatus: email.status,
      emailReason: email.reason,
      recipientCount: email.recipientCount,
      error: email.error,
    });

    results.push({ teamId: team.id, aggregateCount, weeks, email });
  }

  const emailSummary = results.reduce(
    (summary, result) => {
      summary[result.email.status] += 1;
      return summary;
    },
    { sent: 0, skipped: 0, failed: 0 },
  );

  console.info("[weekly-aggregation] completed run", {
    resultCount: results.length,
    emailSummary,
  });

  return { results, emailWindow, emailSummary };
};
