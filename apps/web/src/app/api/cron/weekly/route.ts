import { env } from "@/server/env";
import { runWeeklyAggregation } from "@/server/jobs/weekly-aggregation";

const authorize = (req: Request) =>
  req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;

const handler = async (req: Request) => {
  if (!authorize(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runWeeklyAggregation();
  return Response.json({ ok: true, result });
};

export { handler as GET, handler as POST };
