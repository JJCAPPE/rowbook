import { env } from "@/server/env";
import { runProofExtraction } from "@/server/jobs/proof-extraction";

export const runtime = "nodejs";

const authorize = (req: Request) =>
  req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;

const handler = async (req: Request) => {
  if (!authorize(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runProofExtraction({ maxJobs: 1 });
  return Response.json({ ok: true, result });
};

export { handler as GET, handler as POST };
