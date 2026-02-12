import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteFileSpy: vi.fn(async () => undefined),
}));

vi.mock("@/server/storage/proof-storage", () => ({
  createUploadUrl: vi.fn(),
  createViewUrl: vi.fn(),
  deleteFile: mocks.deleteFileSpy,
  downloadFile: vi.fn(),
}));

import { prisma } from "../../apps/web/src/db/client.ts";
import { runProofCleanup } from "../../apps/web/src/server/jobs/cleanup-proof-images.ts";
import { seedBasicTeam } from "../setup/db-fixtures.ts";

describe("@smoke proof-cleanup-job", () => {
  it("deletes expired proof images and marks deletedAt", async () => {
    const { athleteA } = await seedBasicTeam(prisma);

    const proof = await prisma.proofImage.create({
      data: {
        athleteId: athleteA.id,
        storagePath: `${athleteA.id}/expired.png`,
        deleteAfter: new Date(Date.now() - 60_000),
        validationStatus: "NOT_CHECKED",
      },
    });

    const result = await runProofCleanup();

    expect(result.deletedCount).toBe(1);
    expect(mocks.deleteFileSpy).toHaveBeenCalledWith(`${athleteA.id}/expired.png`);

    const fromDb = await prisma.proofImage.findUniqueOrThrow({ where: { id: proof.id } });
    expect(fromDb.deletedAt).not.toBeNull();
  });
});
