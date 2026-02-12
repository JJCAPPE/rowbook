import { describe, expect, it } from "vitest";

import { prisma } from "../../apps/web/src/db/client.ts";
import { overrideValidationStatus } from "../../apps/web/src/server/services/validation-service.ts";
import { createUploadedProofImage, getCurrentWeekRange, seedBasicTeam } from "../setup/db-fixtures.ts";

describe("@smoke validation-service", () => {
  it("overrides entry and proof validation status", async () => {
    const { team, coach, athleteA } = await seedBasicTeam(prisma);
    const { weekStartAt } = getCurrentWeekRange();

    const proof = await createUploadedProofImage(prisma, athleteA.id, {
      validationStatus: "PENDING",
    });

    const entry = await prisma.trainingEntry.create({
      data: {
        athleteId: athleteA.id,
        activityType: "ERG",
        date: weekStartAt,
        minutes: 40,
        distance: 10,
        avgHr: 150,
        validationStatus: "PENDING",
        entryStatus: "ACTIVE",
        weekStartAt,
        proofImageId: proof.id,
        proofImages: {
          connect: [{ id: proof.id }],
        },
      },
    });

    await prisma.weeklyRequirement.create({
      data: {
        teamId: team.id,
        weekStartAt,
        weekEndAt: new Date(weekStartAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        requiredMinutes: 30,
      },
    });

    const updated = await overrideValidationStatus(
      coach.id,
      entry.id,
      "REJECTED",
      "Proof does not match.",
    );

    expect(updated.validationStatus).toBe("REJECTED");
    expect(updated.rejectionNote).toBe("Proof does not match.");

    const proofFromDb = await prisma.proofImage.findUniqueOrThrow({ where: { id: proof.id } });
    expect(proofFromDb.validationStatus).toBe("REJECTED");
    expect(proofFromDb.reviewedById).toBe(coach.id);
  });
});
