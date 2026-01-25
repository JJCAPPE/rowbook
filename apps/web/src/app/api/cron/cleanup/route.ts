import { env } from "@/server/env";
import { runProofCleanup } from "@/server/jobs/cleanup-proof-images";

const authorize = (req: Request) =>
  req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;

const handler = async (req: Request) => {
  if (!authorize(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runProofCleanup();
  return Response.json({ ok: true, result });
};

export { handler as GET, handler as POST };
