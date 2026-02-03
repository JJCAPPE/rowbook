import { env } from "@/server/env";
import { runWeeklyAggregation } from "@/server/jobs/weekly-aggregation";

const authorize = (req: Request) =>
  req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;

const handler = async (req: Request) => {
  if (!authorize(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const weeksParam = url.searchParams.get("weeks");
  const rebuild = url.searchParams.get("rebuild") === "1";
  const weeks = weeksParam ? Math.max(1, Number(weeksParam)) : 6;

  const result = await runWeeklyAggregation({
    weeks: Number.isFinite(weeks) ? weeks : 6,
    sendEmails: !rebuild,
  });
  return Response.json({ ok: true, result });
};

export { handler as GET, handler as POST };
