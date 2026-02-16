import { env } from "@/server/env";
import { runWeeklyAggregation } from "@/server/jobs/weekly-aggregation";

export const runtime = "nodejs";

const authorize = (req: Request) =>
  req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;

const handler = async (req: Request) => {
  if (!authorize(req)) {
    console.warn("[cron/weekly] unauthorized request", {
      path: new URL(req.url).pathname,
      hasAuthorization: Boolean(req.headers.get("authorization")),
    });
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const weeksParam = url.searchParams.get("weeks");
  const rebuild = url.searchParams.get("rebuild") === "1";
  const weeks = weeksParam ? Math.max(1, Number(weeksParam)) : 6;

  const normalizedWeeks = Number.isFinite(weeks) ? weeks : 6;

  console.info("[cron/weekly] starting run", {
    weeks: normalizedWeeks,
    sendEmails: !rebuild,
  });

  try {
    const result = await runWeeklyAggregation({
      weeks: normalizedWeeks,
      sendEmails: !rebuild,
    });

    console.info("[cron/weekly] completed run", {
      weeks: normalizedWeeks,
      sendEmails: !rebuild,
      emailSummary: result.emailSummary,
    });

    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/weekly] failed run", {
      weeks: normalizedWeeks,
      sendEmails: !rebuild,
      error: message,
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
};

export { handler as GET, handler as POST };
