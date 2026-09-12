import {
  ActivityType,
  getPreviousWeekStartAt,
  getWeekEndAt,
  getWeekStartAt,
  WeeklyStatus,
} from "@rowbook/shared";
import { env } from "@/server/env";
import { listTeams } from "@/server/repositories/teams";
import {
  claimNextWeeklyRecapDelivery,
  enqueueWeeklyRecapDeliveries,
  listEligibleWeeklyRecapTeams,
  markExpiredWeeklyRecapLeasesUnknown,
  markWeeklyRecapFailed,
  markWeeklyRecapSent,
  markWeeklyRecapUnknown,
} from "@/server/repositories/weekly-recap-deliveries";
import {
  aggregateWeekForTeam,
  getTeamLeaderboard,
  getTeamStats,
} from "@/server/services/weekly-service";
import {
  buildWeeklyRecapEmail,
  type WeeklyRecapEmail,
} from "@/server/email/weekly-recap-template";
import {
  getEmailDeliveryFailure,
  sendEmail,
} from "@/server/services/email-service";
import {
  getWeeklyRecapWindow,
  WEEKLY_RECAP_TIME_ZONE,
} from "@/server/jobs/weekly-recap-window";

type WeeklyAggregationOptions = {
  weeks?: number;
  sendEmails?: boolean;
  now?: Date;
  deliveryBatchSize?: number;
  sendEmailFn?: typeof sendEmail;
  rebuildWeeklyAggregatesFn?: typeof rebuildWeeklyAggregates;
};

type WeeklyRecapDeliveryOptions = {
  now?: Date;
  deliveryBatchSize?: number;
  sendEmailFn?: typeof sendEmail;
};

const WEEKLY_RECAP_TEMPLATE_VERSION = "weekly-recap-v2";
const DELIVERY_LEASE_MS = 3 * 60 * 1_000;
const DELIVERY_CONCURRENCY = 4;
const DEFAULT_DELIVERY_BATCH_SIZE = 100;
const MAX_DELIVERY_BATCH_SIZE = 100;
const MAX_DELIVERY_ATTEMPTS = 3;
const MAX_REBUILD_WEEKS = 52;
const RETRY_DELAYS_MS = [5 * 60 * 1_000, 30 * 60 * 1_000, 2 * 60 * 60 * 1_000];

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

const buildWeekStarts = (weeks: number, referenceDate: Date) => {
  const weekStarts: Date[] = [];
  let current = getWeekStartAt(referenceDate);

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
    direction:
      percent > 0
        ? ("up" as const)
        : percent < 0
          ? ("down" as const)
          : ("neutral" as const),
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
  const targetMetCount = visibleRows.filter(
    (row) => row.status === "MET",
  ).length;
  const completionRate =
    visibleRows.length > 0
      ? Math.round((targetMetCount / visibleRows.length) * 100)
      : 0;
  const pendingProofCount = visibleRows.filter(
    (row) => row.pendingProof,
  ).length;
  const rejectedProofCount = visibleRows.filter(
    (row) => row.missingProof,
  ).length;
  const averageMinutesPerAthlete =
    visibleRows.length > 0
      ? Math.round(
          visibleRows.reduce((sum, row) => sum + row.totalMinutes, 0) /
            visibleRows.length,
        )
      : 0;

  const topVolumeRow = [...activeRows].sort(
    (a, b) => b.totalMinutes - a.totalMinutes,
  )[0];
  const distanceLeaderRow = [...activeRows].sort(
    (a, b) => b.totalDistance - a.totalDistance,
  )[0];
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

      const activityIconsHtml = row.activityTypes
        .map((type) => activityIcons[type] || "")
        .join(" ");

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
            <span style="display: inline-block; padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 600; color: ${row.status === "MET" ? "#065F46" : row.status === "NOT_MET" ? "#9F1239" : "#3F3F46"}; background-color: ${row.status === "MET" ? "#D1FAE5" : row.status === "NOT_MET" ? "#FFE4E6" : "#F4F4F5"};">
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
              week.minutes > 0
                ? Math.max((week.minutes / maxTrendMinutes) * 100, 6)
                : 0;
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
              const trend = getTrend(
                teamStats.totalMinutes,
                previousTeamStats.totalMinutes,
              );
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
              const trend = getTrend(
                teamStats.totalDistance,
                previousTeamStats.totalDistance,
              );
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

const normalizeWeeks = (weeks: number | undefined) => {
  const value = weeks !== undefined && Number.isFinite(weeks) ? weeks : 6;
  return Math.min(MAX_REBUILD_WEEKS, Math.max(1, Math.floor(value)));
};

const normalizeBatchSize = (batchSize: number | undefined) => {
  const value =
    batchSize !== undefined && Number.isFinite(batchSize)
      ? batchSize
      : DEFAULT_DELIVERY_BATCH_SIZE;
  return Math.min(MAX_DELIVERY_BATCH_SIZE, Math.max(1, Math.floor(value)));
};

const getAppUrl = () => {
  if (env.NEXT_PUBLIC_APP_URL) return env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
};

export const rebuildWeeklyAggregates = async (
  options: {
    weeks?: number;
    now?: Date;
  } = {},
) => {
  const now = options.now ?? new Date();
  const weeks = normalizeWeeks(options.weeks);
  const weekStarts = buildWeekStarts(weeks, now);
  const teams = await listTeams();
  const results: Array<{ teamId: string; aggregateCount: number }> = [];

  for (const team of teams) {
    let aggregateCount = 0;
    for (const weekStartAt of weekStarts) {
      const aggregates = await aggregateWeekForTeam(team.id, weekStartAt);
      aggregateCount += aggregates.length;
    }
    results.push({ teamId: team.id, aggregateCount });
  }

  return {
    weeks,
    teamCount: teams.length,
    aggregateCount: results.reduce(
      (total, result) => total + result.aggregateCount,
      0,
    ),
    results,
  };
};

const enqueueDueWeeklyRecaps = async (weekStartAt: Date, now: Date) => {
  const teams = await listEligibleWeeklyRecapTeams();
  const results: Array<{
    teamId: string;
    recipientCount: number;
    createdCount: number;
  }> = [];

  for (const team of teams) {
    const result = await enqueueWeeklyRecapDeliveries({
      teamId: team.id,
      weekStartAt,
      templateVersion: WEEKLY_RECAP_TEMPLATE_VERSION,
      now,
    });
    results.push({ teamId: team.id, ...result });
  }

  return {
    teamCount: teams.length,
    recipientCount: results.reduce(
      (total, result) => total + result.recipientCount,
      0,
    ),
    createdCount: results.reduce(
      (total, result) => total + result.createdCount,
      0,
    ),
    results,
  };
};

const getRetryAt = (now: Date, attemptCount: number) => {
  const retryDelay =
    RETRY_DELAYS_MS[Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1)];
  return new Date(now.getTime() + retryDelay);
};

const isDeliveryAuthorized = (delivery: {
  teamId: string;
  team: { weeklyRecapEnabled: boolean; athletes: Array<{ id: string }> };
  recipient: {
    role: string;
    status: string;
    athleteProfile: { teamId: string } | null;
    coachedTeams: Array<{ teamId: string }>;
  };
}) => {
  if (!delivery.team.weeklyRecapEnabled || delivery.team.athletes.length === 0)
    return false;
  if (delivery.recipient.status !== "ACTIVE") return false;

  const isTeamAthlete =
    delivery.recipient.athleteProfile?.teamId === delivery.teamId;
  const isAuthorizedCoach =
    (delivery.recipient.role === "COACH" ||
      delivery.recipient.role === "ADMIN") &&
    delivery.recipient.coachedTeams.some(
      (membership) => membership.teamId === delivery.teamId,
    );

  return isTeamAthlete || isAuthorizedCoach;
};

const deliverWeeklyRecaps = async (options: {
  weekStartAt: Date;
  now: Date;
  batchSize: number;
  sendEmailFn?: typeof sendEmail;
}) => {
  const summary = {
    claimed: 0,
    sent: 0,
    retryScheduled: 0,
    failed: 0,
    unknown: 0,
    casMiss: 0,
    staleLeasesMarkedUnknown: await markExpiredWeeklyRecapLeasesUnknown(
      options.now,
    ),
  };
  const emailCache = new Map<string, Promise<WeeklyRecapEmail>>();

  const markFailed = async (
    delivery: { id: string; claimToken: string; attemptCount: number },
    errorCode: string,
    canRetry: boolean,
  ) => {
    const willRetry = canRetry && delivery.attemptCount < MAX_DELIVERY_ATTEMPTS;

    try {
      const updated = await markWeeklyRecapFailed({
        id: delivery.id,
        claimToken: delivery.claimToken,
        errorCode,
        retryAt: getRetryAt(options.now, delivery.attemptCount),
        terminal: !willRetry,
        maxAttempts: MAX_DELIVERY_ATTEMPTS,
      });
      if (!updated) {
        summary.casMiss += 1;
        return;
      }
      if (willRetry) summary.retryScheduled += 1;
      else summary.failed += 1;
    } catch {
      summary.casMiss += 1;
      console.error("[weekly-recap] failed to persist delivery failure", {
        deliveryId: delivery.id,
      });
    }
  };

  const markUnknown = async (
    delivery: { id: string; claimToken: string },
    errorCode: string,
    provider?: string,
    providerMessageId?: string,
  ) => {
    try {
      const updated = await markWeeklyRecapUnknown({
        id: delivery.id,
        claimToken: delivery.claimToken,
        errorCode,
        provider,
        providerMessageId,
      });
      if (!updated) summary.casMiss += 1;
    } catch {
      summary.casMiss += 1;
      console.error(
        "[weekly-recap] failed to persist unknown delivery outcome",
        {
          deliveryId: delivery.id,
        },
      );
    }
    summary.unknown += 1;
  };

  type ClaimedDelivery = NonNullable<
    Awaited<ReturnType<typeof claimNextWeeklyRecapDelivery>>
  >;

  const processDelivery = async (delivery: ClaimedDelivery) => {
    if (!delivery.claimToken) {
      summary.casMiss += 1;
      return;
    }

    const claimedDelivery = { ...delivery, claimToken: delivery.claimToken };
    if (!isDeliveryAuthorized(claimedDelivery)) {
      await markFailed(
        claimedDelivery,
        "EMAIL_RECIPIENT_NOT_AUTHORIZED",
        false,
      );
      return;
    }
    if (delivery.templateVersion !== WEEKLY_RECAP_TEMPLATE_VERSION) {
      await markFailed(
        claimedDelivery,
        "EMAIL_TEMPLATE_VERSION_UNSUPPORTED",
        false,
      );
      return;
    }

    const cacheKey = `${delivery.teamId}:${delivery.weekStartAt.toISOString()}`;
    let emailPromise = emailCache.get(cacheKey);
    if (!emailPromise) {
      emailPromise = Promise.all([
        getTeamLeaderboard(delivery.teamId, delivery.weekStartAt, {
          rebuildIfMissing: false,
        }),
        getTeamStats(delivery.teamId, delivery.weekStartAt),
      ]).then(([rows, teamStats]) => {
        if (rows.length === 0) {
          throw new Error("Weekly aggregates are not ready for recap delivery.");
        }
        return buildWeeklyRecapEmail({
          teamName: delivery.team.name,
          weekStartAt: delivery.weekStartAt,
          weekEndAt: getWeekEndAt(delivery.weekStartAt, WEEKLY_RECAP_TIME_ZONE),
          teamStats,
          rows,
          appUrl: getAppUrl(),
        });
      });
      emailCache.set(cacheKey, emailPromise);
    }

    let email: WeeklyRecapEmail;
    try {
      email = await emailPromise;
    } catch {
      await markFailed(claimedDelivery, "EMAIL_PREPARATION_FAILED", true);
      return;
    }

    let sendResult: Awaited<ReturnType<typeof sendEmail>>;
    try {
      sendResult = await (options.sendEmailFn ?? sendEmail)({
        to: delivery.recipient.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        idempotencyKey: `weekly-recap:${delivery.teamId}:${delivery.weekStartAt.toISOString()}:${delivery.userId}`,
      });
    } catch (error) {
      const failure = getEmailDeliveryFailure(error);
      if (failure.ambiguous) {
        await markUnknown(claimedDelivery, failure.code);
      } else {
        await markFailed(claimedDelivery, failure.code, failure.transient);
      }
      return;
    }

    try {
      const persisted = await markWeeklyRecapSent({
        id: delivery.id,
        claimToken: delivery.claimToken,
        provider: sendResult.provider,
        providerMessageId: sendResult.messageId,
        sentAt: options.now,
      });
      if (persisted) {
        summary.sent += 1;
      } else {
        await markUnknown(
          claimedDelivery,
          "EMAIL_SENT_FINALIZE_CAS_MISS",
          sendResult.provider,
          sendResult.messageId,
        );
      }
    } catch {
      await markUnknown(
        claimedDelivery,
        "EMAIL_SENT_FINALIZE_FAILED",
        sendResult.provider,
        sendResult.messageId,
      );
    }
  };

  let nextClaimIndex = 0;
  const workers = Array.from(
    { length: Math.min(DELIVERY_CONCURRENCY, options.batchSize) },
    async () => {
      while (nextClaimIndex < options.batchSize) {
        nextClaimIndex += 1;
        const delivery = await claimNextWeeklyRecapDelivery({
          weekStartAt: options.weekStartAt,
          now: options.now,
          leaseMs: DELIVERY_LEASE_MS,
          maxAttempts: MAX_DELIVERY_ATTEMPTS,
        });
        if (!delivery) return;
        summary.claimed += 1;
        await processDelivery(delivery);
      }
    },
  );
  await Promise.all(workers);

  return summary;
};

export const runWeeklyRecapDelivery = async (
  options: WeeklyRecapDeliveryOptions = {},
) => {
  const now = options.now ?? new Date();
  const window = getWeeklyRecapWindow(now);
  const emailWindow = {
    timezone: window.timezone,
    now: window.now.toISOString(),
    isOpen: window.isOpen,
    isInitialWindow: window.isInitialWindow,
    isCatchUpWindow: window.isCatchUpWindow,
    recapWeekStartAt: window.recapWeekStartAt.toISOString(),
    recapWeekEndAt: window.recapWeekEndAt.toISOString(),
    windowEndsAt: window.windowEndsAt.toISOString(),
  };

  if (!window.isOpen) {
    return {
      emailWindow,
      delivery: {
        status: "skipped" as const,
        reason: "outside-email-window" as const,
      },
      emailSummary: {
        sent: 0,
        retryScheduled: 0,
        failed: 0,
        unknown: 0,
        casMiss: 0,
      },
      needsAttention: false,
    };
  }

  const delivery = await deliverWeeklyRecaps({
    weekStartAt: window.recapWeekStartAt,
    now,
    batchSize: normalizeBatchSize(options.deliveryBatchSize),
    sendEmailFn: options.sendEmailFn,
  });
  const emailSummary = {
    sent: delivery.sent,
    retryScheduled: delivery.retryScheduled,
    failed: delivery.failed,
    unknown: delivery.unknown + delivery.staleLeasesMarkedUnknown,
    casMiss: delivery.casMiss,
  };

  return {
    emailWindow,
    delivery: { status: "completed" as const, ...delivery },
    emailSummary,
    needsAttention:
      emailSummary.retryScheduled +
        emailSummary.failed +
        emailSummary.unknown +
        emailSummary.casMiss >
      0,
  };
};

export const runWeeklyAggregation = async (
  options: WeeklyAggregationOptions = {},
) => {
  const runStartedAt = options.now ?? new Date();
  const sendEmails = options.sendEmails ?? true;
  const requestedWeeks = normalizeWeeks(options.weeks);
  const window = getWeeklyRecapWindow(runStartedAt);
  const emailWindow = {
    timezone: window.timezone,
    now: window.now.toISOString(),
    isOpen: window.isOpen,
    isInitialWindow: window.isInitialWindow,
    isCatchUpWindow: window.isCatchUpWindow,
    recapWeekStartAt: window.recapWeekStartAt.toISOString(),
    recapWeekEndAt: window.recapWeekEndAt.toISOString(),
    windowEndsAt: window.windowEndsAt.toISOString(),
  };

  const recap = await (async () => {
    if (!sendEmails || !window.isOpen) {
      const reason = sendEmails ? "outside-email-window" : "emails-disabled";
      const emailSummary = {
        sent: 0,
        retryScheduled: 0,
        failed: 0,
        unknown: 0,
        casMiss: 0,
      };
      return {
        enqueue: { status: "skipped" as const, reason },
        delivery: { status: "skipped" as const, reason },
        emailSummary,
        needsAttention: false,
      };
    }

    // Recap persistence and delivery are cutoff-critical. Run them before the
    // repair-only aggregate rebuild so slow or failed repairs cannot suppress
    // a recap that reads directly from canonical entries.
    const enqueue = await enqueueDueWeeklyRecaps(
      window.recapWeekStartAt,
      runStartedAt,
    );
    const delivery = await deliverWeeklyRecaps({
      weekStartAt: window.recapWeekStartAt,
      now: runStartedAt,
      batchSize: normalizeBatchSize(options.deliveryBatchSize),
      sendEmailFn: options.sendEmailFn,
    });
    const emailSummary = {
      sent: delivery.sent,
      retryScheduled: delivery.retryScheduled,
      failed: delivery.failed,
      unknown: delivery.unknown + delivery.staleLeasesMarkedUnknown,
      casMiss: delivery.casMiss,
    };

    return {
      enqueue: { status: "completed" as const, ...enqueue },
      delivery: { status: "completed" as const, ...delivery },
      emailSummary,
      needsAttention:
        emailSummary.retryScheduled +
          emailSummary.failed +
          emailSummary.unknown +
          emailSummary.casMiss >
        0,
    };
  })();

  const rebuildWeeks = sendEmails
    ? Math.max(2, requestedWeeks)
    : requestedWeeks;
  let aggregation: Awaited<ReturnType<typeof rebuildWeeklyAggregates>> | null =
    null;
  let aggregationError: { code: "WEEKLY_AGGREGATION_REPAIR_FAILED" } | null =
    null;

  try {
    aggregation = await (
      options.rebuildWeeklyAggregatesFn ?? rebuildWeeklyAggregates
    )({
      weeks: rebuildWeeks,
      now: runStartedAt,
    });
  } catch (error) {
    aggregationError = { code: "WEEKLY_AGGREGATION_REPAIR_FAILED" };
    console.error("[weekly-aggregation] aggregate repair failed", {
      errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    });
  }

  console.info("[weekly-aggregation] completed run", {
    weeks: aggregation?.weeks ?? rebuildWeeks,
    aggregateCount: aggregation?.aggregateCount ?? null,
    aggregationStatus: aggregationError ? "failed" : "completed",
    enqueued:
      recap.enqueue.status === "completed" ? recap.enqueue.createdCount : 0,
    emailSummary: recap.emailSummary,
  });

  return {
    aggregation,
    aggregationError,
    emailWindow,
    enqueue: recap.enqueue,
    delivery: recap.delivery,
    emailSummary: recap.emailSummary,
    needsAttention: recap.needsAttention || aggregationError !== null,
  };
};
