import { env } from "@/server/env";
import { runWeeklyRecapDelivery } from "@/server/jobs/weekly-aggregation";

export const runtime = "nodejs";
export const maxDuration = 300;

const DELIVERY_BATCH_SIZE = 40;

const authorize = (req: Request) =>
  req.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`;

const handler = async (req: Request) => {
  if (!authorize(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runWeeklyRecapDelivery({
      deliveryBatchSize: DELIVERY_BATCH_SIZE,
    });

    console.info("[cron/weekly-recap-delivery] completed run", {
      emailWindow: result.emailWindow,
      emailSummary: result.emailSummary,
      needsAttention: result.needsAttention,
    });

    return Response.json(
      { ok: !result.needsAttention, result },
      { status: result.needsAttention ? 503 : 200 },
    );
  } catch (error) {
    console.error("[cron/weekly-recap-delivery] failed run", {
      errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
    });
    return Response.json(
      { ok: false, error: "weekly-recap-delivery-cron-failed" },
      { status: 500 },
    );
  }
};

export { handler as GET, handler as POST };
