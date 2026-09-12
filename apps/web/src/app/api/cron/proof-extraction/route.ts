import { env } from "@/server/env";
import {
  MAX_PROOF_EXTRACTION_JOBS_PER_RUN,
  runProofExtraction,
} from "@/server/jobs/proof-extraction";

export const runtime = "nodejs";
export const maxDuration = 300;

const CLAIM_WINDOW_MS = 210_000;

const authorize = (req: Request) =>
  req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;

const handler = async (req: Request) => {
  if (!authorize(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runProofExtraction({
    maxJobs: MAX_PROOF_EXTRACTION_JOBS_PER_RUN,
    // Leave ninety seconds for the last provider call and final database write.
    claimWindowMs: CLAIM_WINDOW_MS,
  });
  return Response.json({ ok: true, result });
};

export { handler as GET, handler as POST };
