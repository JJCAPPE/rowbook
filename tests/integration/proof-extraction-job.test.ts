import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  downloadFileSpy: vi.fn(async () => Buffer.from("proof")),
  extractProofSpy: vi.fn(async () => ({
    date: "2026-02-07",
    minutes: 45,
    distance: 10.591,
    avgHr: 150,
    confidence: 0.98,
    rejectionReason: null,
  })),
}));

vi.mock("@/server/storage/proof-storage", () => ({
  downloadFile: mocks.downloadFileSpy,
}));

vi.mock("@/server/services/proof-extraction-service", () => ({
  extractProofWithGemini: mocks.extractProofSpy,
}));

import { prisma } from "../../apps/web/src/db/client.ts";
import { runProofExtraction } from "../../apps/web/src/server/jobs/proof-extraction.ts";
import {
  createUploadedProofImage,
  getCurrentWeekRange,
  seedBasicTeam,
} from "../setup/db-fixtures.ts";

describe("@smoke proof-extraction-job", () => {
  it("processes queued jobs and updates proof + entry state", async () => {
    const { athleteA } = await seedBasicTeam(prisma);
    const { weekStartAt } = getCurrentWeekRange();

    const proof = await createUploadedProofImage(prisma, athleteA.id, {
      validationStatus: "NOT_CHECKED",
    });

    const entry = await prisma.trainingEntry.create({
      data: {
        athleteId: athleteA.id,
        activityType: "RUN",
        date: new Date("2026-02-07T12:00:00.000Z"),
        minutes: 45,
        distance: 10.5,
        avgHr: 150,
        validationStatus: "NOT_CHECKED",
        entryStatus: "ACTIVE",
        weekStartAt,
        proofImageId: proof.id,
        proofImages: {
          connect: [{ id: proof.id }],
        },
      },
      include: { proofImages: true },
    });

    await prisma.proofExtractionJob.create({
      data: {
        proofImageId: proof.id,
        status: "NOT_CHECKED",
      },
    });

    const result = await runProofExtraction({ maxJobs: 1 });
    expect(result.processed).toBe(1);
    expect(result.results[0]).toMatchObject({ status: "COMPLETED" });

    const job = await prisma.proofExtractionJob.findUniqueOrThrow({
      where: { proofImageId: proof.id },
    });
    expect(job.status).toBe("COMPLETED");

    const proofFromDb = await prisma.proofImage.findUniqueOrThrow({ where: { id: proof.id } });
    expect(proofFromDb.extractedFields).toBeTruthy();
    expect(proofFromDb.validationStatus).toBe("VERIFIED");

    const entryFromDb = await prisma.trainingEntry.findUniqueOrThrow({ where: { id: entry.id } });
    expect(entryFromDb.validationStatus).toBe("VERIFIED");
  });
});
