const EMAIL_TIME_ZONE = "America/New_York";
const MAX_LEADERBOARD_ROWS = 10;

export type WeeklyRecapStatus = "MET" | "NOT_MET" | "EXEMPT";

export type WeeklyRecapActivityType = "ERG" | "RUN" | "CYCLE" | "SWIM" | "OTHER";

export type WeeklyRecapLeaderboardRow = {
  id?: string;
  athleteId: string;
  name: string;
  totalMinutes: number;
  status: WeeklyRecapStatus;
  activityTypes: WeeklyRecapActivityType[];
  hasHr: boolean;
  missingProof?: boolean;
  pendingProof?: boolean;
  missingMinutes?: boolean;
  totalDistance: number;
  avgHr: number | null;
  previousWeekMinutes: number;
  requiredMinutes?: number;
};

export type WeeklyRecapTeamStats = {
  totalMinutes: number;
  totalDistance: number;
  avgHr: number | null;
};

export type WeeklyRecapTemplateInput = {
  teamName: string;
  weekStartAt: Date;
  weekEndAt: Date;
  teamStats: WeeklyRecapTeamStats;
  rows: readonly WeeklyRecapLeaderboardRow[];
  appUrl: string;
};

export type WeeklyRecapEmail = {
  subject: string;
  html: string;
  text: string;
};

const wholeNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const distanceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EMAIL_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const datePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: EMAIL_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const activityLabels: Record<WeeklyRecapActivityType, string> = {
  ERG: "Erg",
  RUN: "Run",
  CYCLE: "Cycle",
  SWIM: "Swim",
  OTHER: "Other",
};

const statusLabels: Record<WeeklyRecapStatus, string> = {
  MET: "Target met",
  NOT_MET: "Below target",
  EXEMPT: "Exempt",
};

const statusColors: Record<WeeklyRecapStatus, { background: string; foreground: string }> = {
  MET: { background: "#dcfce7", foreground: "#166534" },
  NOT_MET: { background: "#fef3c7", foreground: "#92400e" },
  EXEMPT: { background: "#e2e8f0", foreground: "#475569" },
};

const cleanText = (value: string) =>
  value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const nonNegativeNumber = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const formatMinutes = (value: number) => wholeNumberFormatter.format(nonNegativeNumber(value));

const formatDistance = (value: number) => distanceFormatter.format(nonNegativeNumber(value));

const formatHeartRate = (value: number | null) =>
  value === null || !Number.isFinite(value) || value <= 0
    ? "Not recorded"
    : `${wholeNumberFormatter.format(value)} bpm`;

const assertValidDate = (value: Date, label: string) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`${label} must be a valid Date.`);
  }
};

const validateCtaUrl = (value: string) => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new TypeError("CTA URL must be an absolute HTTP or HTTPS URL.");
  }

  const isLocalPreview =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if ((url.protocol !== "https:" && !isLocalPreview) || url.username || url.password) {
    throw new TypeError(
      "CTA URL must use HTTPS without embedded credentials (HTTP is allowed for local previews).",
    );
  }

  return url.toString();
};

const getDateParts = (date: Date) => {
  const parts = datePartsFormatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    month: getPart("month"),
    day: getPart("day"),
    year: getPart("year"),
  };
};

const formatShortWeekRange = (start: Date, end: Date) => {
  const startParts = getDateParts(start);
  const endParts = getDateParts(end);

  if (startParts.year !== endParts.year) {
    return `${startParts.month} ${startParts.day}, ${startParts.year}–${endParts.month} ${endParts.day}, ${endParts.year}`;
  }

  if (startParts.month !== endParts.month) {
    return `${startParts.month} ${startParts.day}–${endParts.month} ${endParts.day}, ${startParts.year}`;
  }

  return `${startParts.month} ${startParts.day}–${endParts.day}, ${startParts.year}`;
};

const pluralizeAthlete = (count: number) => (count === 1 ? "athlete" : "athletes");

const formatProofSummary = (pendingCount: number, rejectedCount: number) => {
  if (pendingCount === 0 && rejectedCount === 0) {
    return "No proof reviews are pending and no rejected proof needs attention.";
  }

  const parts: string[] = [];
  if (pendingCount > 0) {
    parts.push(`${pendingCount} ${pluralizeAthlete(pendingCount)} awaiting review`);
  }
  if (rejectedCount > 0) {
    parts.push(`${rejectedCount} ${pluralizeAthlete(rejectedCount)} with rejected proof`);
  }

  return `${parts.join("; ")}.`;
};

const formatTargetSummary = (metCount: number, eligibleCount: number, completionRate: number) =>
  eligibleCount === 0
    ? "No athletes were eligible for target tracking this week."
    : `${metCount} of ${eligibleCount} ${pluralizeAthlete(eligibleCount)} met target (${completionRate}%).`;

const formatActivityTypes = (types: readonly WeeklyRecapActivityType[]) =>
  types.length > 0 ? types.map((type) => activityLabels[type]).join(", ") : "No activity type recorded";

const getProofStatus = (row: WeeklyRecapLeaderboardRow) => {
  if (row.missingProof) return "Proof rejected — update needed";
  if (row.pendingProof) return "Proof review pending";
  return null;
};

const buildLeaderboardRowsHtml = (rows: readonly WeeklyRecapLeaderboardRow[]) =>
  rows
    .map((row, index) => {
      const name = escapeHtml(cleanText(row.name) || "Unnamed athlete");
      const statusLabel = statusLabels[row.status];
      const statusColor = statusColors[row.status];
      const proofStatus = getProofStatus(row);
      const details = [
        `${formatMinutes(row.totalMinutes)} min`,
        `${formatDistance(row.totalDistance)} km`,
        formatHeartRate(row.avgHr),
        formatActivityTypes(row.activityTypes),
      ]
        .map(escapeHtml)
        .join(" &middot; ");

      return `
                          <tr>
                            <td valign="top" width="32" style="padding: 16px 8px 16px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 20px; font-weight: 700;">${index + 1}</td>
                            <td valign="top" style="padding: 16px 8px; border-bottom: 1px solid #e2e8f0; font-family: Arial, Helvetica, sans-serif;">
                              <div style="color: #0f172a; font-size: 15px; line-height: 21px; font-weight: 700; word-break: break-word;">${name}</div>
                              <div style="padding-top: 3px; color: #64748b; font-size: 12px; line-height: 18px;">${details}</div>
                            </td>
                            <td valign="top" align="right" width="94" style="padding: 16px 0 16px 8px; border-bottom: 1px solid #e2e8f0; font-family: Arial, Helvetica, sans-serif;">
                              <span style="display: inline-block; padding: 5px 9px; border-radius: 4px; background-color: ${statusColor.background}; color: ${statusColor.foreground}; font-size: 11px; line-height: 16px; font-weight: 700; white-space: nowrap;">${statusLabel}</span>
                              ${
                                proofStatus
                                  ? `<div style="padding-top: 6px; color: #475569; font-size: 11px; line-height: 16px; font-weight: 600;">${escapeHtml(proofStatus)}</div>`
                                  : ""
                              }
                            </td>
                          </tr>`;
    })
    .join("");

const buildLeaderboardText = (rows: readonly WeeklyRecapLeaderboardRow[]) =>
  rows
    .map((row, index) => {
      const proofStatus = getProofStatus(row);
      const line = `${index + 1}. ${cleanText(row.name) || "Unnamed athlete"} — ${formatMinutes(row.totalMinutes)} min · ${formatDistance(row.totalDistance)} km · ${formatHeartRate(row.avgHr)} · ${statusLabels[row.status]} · ${formatActivityTypes(row.activityTypes)}`;
      return proofStatus ? `${line}\n   ${proofStatus}` : line;
    })
    .join("\n");

export const buildWeeklyRecapEmail = (input: WeeklyRecapTemplateInput): WeeklyRecapEmail => {
  assertValidDate(input.weekStartAt, "weekStartAt");
  assertValidDate(input.weekEndAt, "weekEndAt");
  if (input.weekEndAt.getTime() <= input.weekStartAt.getTime()) {
    throw new RangeError("weekEndAt must be later than weekStartAt.");
  }

  const teamName = cleanText(input.teamName);
  if (!teamName) {
    throw new TypeError("teamName must contain visible text.");
  }

  const ctaUrl = validateCtaUrl(input.appUrl);
  const weekWindow = `${dateTimeFormatter.format(input.weekStartAt)} – ${dateTimeFormatter.format(input.weekEndAt)}`;
  const subject = `${teamName} weekly recap · ${formatShortWeekRange(input.weekStartAt, input.weekEndAt)}`;

  const eligibleRows = input.rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .filter(({ row }) => row.status !== "EXEMPT")
    .sort(
      (left, right) =>
        nonNegativeNumber(right.row.totalMinutes) - nonNegativeNumber(left.row.totalMinutes) ||
        left.originalIndex - right.originalIndex,
    )
    .map(({ row }) => row);
  const exemptCount = input.rows.length - eligibleRows.length;
  const leaderboardRows = eligibleRows.slice(0, MAX_LEADERBOARD_ROWS);
  const remainingCount = eligibleRows.length - leaderboardRows.length;
  const metCount = eligibleRows.filter((row) => row.status === "MET").length;
  const completionRate =
    eligibleRows.length > 0 ? Math.round((metCount / eligibleRows.length) * 100) : 0;
  const pendingCount = eligibleRows.filter((row) => row.pendingProof).length;
  const rejectedCount = eligibleRows.filter((row) => row.missingProof).length;
  const targetSummary = formatTargetSummary(metCount, eligibleRows.length, completionRate);
  const proofSummary = formatProofSummary(pendingCount, rejectedCount);
  const escapedTeamName = escapeHtml(teamName);
  const escapedWeekWindow = escapeHtml(weekWindow);
  const escapedCtaUrl = escapeHtml(ctaUrl);
  const exemptSummary =
    exemptCount > 0 ? `${exemptCount} ${pluralizeAthlete(exemptCount)} exempt.` : "";
  const remainingSummary =
    remainingCount > 0
      ? `${remainingCount} more ${pluralizeAthlete(remainingCount)} are on the full leaderboard.`
      : "";
  const preheader = `${teamName} logged ${formatMinutes(input.teamStats.totalMinutes)} minutes. ${targetSummary}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; color: #0f172a;">
    <div aria-hidden="true" style="display: none; max-height: 0; overflow: hidden; mso-hide: all; color: transparent; opacity: 0; font-size: 1px; line-height: 1px;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f1f5f9" style="width: 100%; border-collapse: collapse; background-color: #f1f5f9;">
      <tr>
        <td align="center" style="padding: 24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
            <tr>
              <td bgcolor="#0f172a" style="padding: 28px 32px; background-color: #0f172a; border-radius: 8px 8px 0 0; font-family: Arial, Helvetica, sans-serif;">
                <div style="color: #5eead4; font-size: 11px; line-height: 16px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Rowbook</div>
                <h1 style="margin: 8px 0 0; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 26px; line-height: 32px; font-weight: 700;">${escapedTeamName} weekly recap</h1>
                <p style="margin: 10px 0 0; color: #cbd5e1; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 20px;">Week window: ${escapedWeekWindow}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px 12px; font-family: Arial, Helvetica, sans-serif;">
                <h2 style="margin: 0 0 14px; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 18px; line-height: 24px; font-weight: 700;">Team summary</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0;">
                  <tr>
                    <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; color: #475569; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 19px;">Total minutes</td>
                    <td align="right" style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 20px; font-weight: 700;">${formatMinutes(input.teamStats.totalMinutes)} min</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; color: #475569; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 19px;">Total distance</td>
                    <td align="right" style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 20px; font-weight: 700;">${formatDistance(input.teamStats.totalDistance)} km</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; color: #475569; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 19px;">Average heart rate</td>
                    <td align="right" style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 16px; line-height: 20px; font-weight: 700;">${escapeHtml(formatHeartRate(input.teamStats.avgHr))}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 14px; color: #475569; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 19px;">Target completion</td>
                    <td align="right" style="padding: 12px 14px; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 20px; font-weight: 700;">${
                      eligibleRows.length > 0
                        ? `${metCount} of ${eligibleRows.length} ${pluralizeAthlete(eligibleRows.length)} met target (${completionRate}%)`
                        : "No eligible athletes"
                    }</td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse; margin-top: 14px;">
                  <tr>
                    <td bgcolor="#f8fafc" style="padding: 13px 14px; border-left: 4px solid #0f766e; background-color: #f8fafc; color: #334155; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 20px;">
                      <strong style="color: #0f172a;">Proof review:</strong> ${escapeHtml(proofSummary)}${exemptSummary ? ` ${escapeHtml(exemptSummary)}` : ""}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 20px 32px 8px; font-family: Arial, Helvetica, sans-serif;">
                <h2 style="margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; font-size: 18px; line-height: 24px; font-weight: 700;">Weekly leaderboard</h2>
                <p style="margin: 5px 0 14px; color: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 18px;">${
                  eligibleRows.length > 0
                    ? `Top ${Math.min(MAX_LEADERBOARD_ROWS, eligibleRows.length)} eligible athletes by recorded minutes.`
                    : "Eligible athletes are ranked by recorded minutes."
                }</p>
                ${
                  leaderboardRows.length > 0
                    ? `<table role="table" aria-label="Weekly leaderboard" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
                        <thead>
                          <tr>
                            <th scope="col" align="left" width="32" style="padding: 8px 8px 8px 0; border-bottom: 2px solid #cbd5e1; color: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 14px; letter-spacing: 1px; text-transform: uppercase;">Rank</th>
                            <th scope="col" align="left" style="padding: 8px; border-bottom: 2px solid #cbd5e1; color: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 14px; letter-spacing: 1px; text-transform: uppercase;">Athlete</th>
                            <th scope="col" align="right" width="94" style="padding: 8px 0 8px 8px; border-bottom: 2px solid #cbd5e1; color: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 14px; letter-spacing: 1px; text-transform: uppercase;">Status</th>
                          </tr>
                        </thead>
                        <tbody>${buildLeaderboardRowsHtml(leaderboardRows)}
                        </tbody>
                      </table>`
                    : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;"><tr><td bgcolor="#f8fafc" style="padding: 18px; background-color: #f8fafc; color: #475569; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 20px; text-align: center;">No leaderboard entries to show yet.</td></tr></table>`
                }
                ${
                  remainingSummary
                    ? `<p style="margin: 12px 0 0; color: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 18px; text-align: center;">${escapeHtml(remainingSummary)}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 24px 32px 30px; font-family: Arial, Helvetica, sans-serif;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
                  <tr>
                    <td align="center" bgcolor="#0f766e" style="background-color: #0f766e; border-radius: 5px;">
                      <a href="${escapedCtaUrl}" style="display: inline-block; padding: 12px 22px; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 20px; font-weight: 700; text-decoration: none;">Open Rowbook</a>
                    </td>
                  </tr>
                </table>
                <p style="margin: 12px 0 0; color: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 17px;">Review the full leaderboard and workout details in Rowbook.</p>
              </td>
            </tr>
            <tr>
              <td bgcolor="#f8fafc" style="padding: 18px 32px; border-top: 1px solid #e2e8f0; background-color: #f8fafc; color: #64748b; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 17px; text-align: center;">This is an automated weekly recap from Rowbook.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textLines = [
    `${teamName.toLocaleUpperCase("en-US")} WEEKLY RECAP`,
    `Week window: ${weekWindow}`,
    "",
    "SUMMARY",
    `Total minutes: ${formatMinutes(input.teamStats.totalMinutes)} min`,
    `Total distance: ${formatDistance(input.teamStats.totalDistance)} km`,
    `Average heart rate: ${formatHeartRate(input.teamStats.avgHr)}`,
    `Target completion: ${
      eligibleRows.length > 0
        ? `${metCount} of ${eligibleRows.length} ${pluralizeAthlete(eligibleRows.length)} (${completionRate}%)`
        : "No eligible athletes"
    }`,
    `Proof review: ${proofSummary.slice(0, -1)}`,
    ...(exemptSummary ? [`Exemptions: ${exemptSummary}`] : []),
    "",
    "WEEKLY LEADERBOARD",
    leaderboardRows.length > 0 ? buildLeaderboardText(leaderboardRows) : "No leaderboard entries to show yet.",
    ...(remainingSummary ? [remainingSummary] : []),
    "",
    `Open Rowbook: ${ctaUrl}`,
    "Review the full leaderboard and workout details in Rowbook.",
  ];

  return {
    subject,
    html,
    text: textLines.join("\n"),
  };
};
