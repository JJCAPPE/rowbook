import { env } from "@/server/env";
import { runWeeklyAggregation } from "@/server/jobs/weekly-aggregation";

export const runtime = "nodejs";
export const maxDuration = 300;

const authorize = (req: Request) =>
  req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;

const parseWeeks = (value: string | null) => {
  if (value === null) return 6;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(52, Math.max(1, Math.floor(parsed)))
    : 6;
};

const handler = async (req: Request) => {
  if (!authorize(req)) {
    console.warn("[cron/weekly] unauthorized request", {
      path: new URL(req.url).pathname,
      hasAuthorization: Boolean(req.headers.get("authorization")),
    });
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const rebuild = url.searchParams.get("rebuild") === "1";
  const weeks = parseWeeks(url.searchParams.get("weeks"));

  console.info("[cron/weekly] starting run", {
    weeks,
    sendEmails: !rebuild,
  });

  try {
    const result = await runWeeklyAggregation({
      weeks,
      sendEmails: !rebuild,
    });

    console.info("[cron/weekly] completed run", {
      weeks,
      sendEmails: !rebuild,
      emailSummary: result.emailSummary,
      needsAttention: result.needsAttention,
    });

    return Response.json(
      { ok: !result.needsAttention, result },
      { status: result.needsAttention ? 503 : 200 },
    );
  } catch (error) {
    console.error("[cron/weekly] failed run", {
      weeks,
      sendEmails: !rebuild,
      errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    });
    return Response.json(
      { ok: false, error: "weekly-cron-failed" },
      { status: 500 },
    );
  }
};

export { handler as GET, handler as POST };
