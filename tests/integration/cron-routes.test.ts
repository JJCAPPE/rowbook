import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runWeeklyAggregationSpy: vi.fn(async () => ({ results: [] })),
  runProofExtractionSpy: vi.fn(async () => ({ processed: 1, results: [] })),
  runProofCleanupSpy: vi.fn(async () => ({ deletedCount: 0 })),
}));

vi.mock("@/server/jobs/weekly-aggregation", () => ({
  runWeeklyAggregation: mocks.runWeeklyAggregationSpy,
}));
vi.mock("@/server/jobs/proof-extraction", () => ({
  runProofExtraction: mocks.runProofExtractionSpy,
}));
vi.mock("@/server/jobs/cleanup-proof-images", () => ({
  runProofCleanup: mocks.runProofCleanupSpy,
}));

import { GET as cleanupGet } from "../../apps/web/src/app/api/cron/cleanup/route.ts";
import { GET as proofGet } from "../../apps/web/src/app/api/cron/proof-extraction/route.ts";
import { GET as weeklyGet } from "../../apps/web/src/app/api/cron/weekly/route.ts";

describe("@smoke cron routes", () => {
  it("rejects unauthorized cron calls", async () => {
    const response = await weeklyGet(new Request("http://localhost/api/cron/weekly"));

    expect(response.status).toBe(401);
  });

  it("passes weekly cron params into aggregation job", async () => {
    const response = await weeklyGet(
      new Request("http://localhost/api/cron/weekly?weeks=3&rebuild=1", {
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.runWeeklyAggregationSpy).toHaveBeenCalledWith({
      weeks: 3,
      sendEmails: false,
    });
  });

  it("calls proof extraction and cleanup jobs when authorized", async () => {
    const proofResponse = await proofGet(
      new Request("http://localhost/api/cron/proof-extraction", {
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      }),
    );
    const cleanupResponse = await cleanupGet(
      new Request("http://localhost/api/cron/cleanup", {
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      }),
    );

    expect(proofResponse.status).toBe(200);
    expect(cleanupResponse.status).toBe(200);
    expect(mocks.runProofExtractionSpy).toHaveBeenCalledWith({ maxJobs: 1 });
    expect(mocks.runProofCleanupSpy).toHaveBeenCalledTimes(1);
  });
});
