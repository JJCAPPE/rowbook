import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProofViewUrlSpy: vi.fn(async () => ({ signedUrl: "https://proof.local/image.png" })),
}));

vi.mock("@/server/services/proof-service", () => ({
  getProofViewUrl: mocks.getProofViewUrlSpy,
}));

import { prisma } from "../../apps/web/src/db/client.ts";
import {
  getAthleteDashboard,
  getAthleteWeekDetail,
} from "../../apps/web/src/server/services/athlete-service.ts";
import {
  createUploadedProofImage,
  getCurrentWeekRange,
  seedBasicTeam,
} from "../setup/db-fixtures.ts";

describe("@smoke athlete-service", () => {
  it("returns dashboard and week detail with attached proof urls", async () => {
    const { team, athleteA } = await seedBasicTeam(prisma);
    const { weekStartAt, weekEndAt } = getCurrentWeekRange();

    await prisma.weeklyRequirement.create({
      data: {
        teamId: team.id,
        weekStartAt,
        weekEndAt,
        requiredMinutes: 40,
      },
    });

    const proof = await createUploadedProofImage(prisma, athleteA.id, {
      validationStatus: "VERIFIED",
    });

    await prisma.trainingEntry.create({
      data: {
        athleteId: athleteA.id,
        activityType: "ERG",
        date: weekStartAt,
        minutes: 50,
        distance: 12,
        avgHr: 152,
        validationStatus: "VERIFIED",
        entryStatus: "ACTIVE",
        weekStartAt,
        proofImageId: proof.id,
        proofImages: {
          connect: [{ id: proof.id }],
        },
      },
    });

    const dashboard = await getAthleteDashboard(athleteA.id, weekStartAt);
    expect(dashboard.totalMinutes).toBe(50);
    expect(dashboard.status).toBe("MET");
    expect(dashboard.entries[0]?.proofUrl).toBe("https://proof.local/image.png");

    const detail = await getAthleteWeekDetail(athleteA.id, weekStartAt);
    expect(detail.sessions).toBe(1);
    expect(detail.entries[0]?.proofUrl).toBe("https://proof.local/image.png");
    expect(mocks.getProofViewUrlSpy).toHaveBeenCalled();
  });
});
