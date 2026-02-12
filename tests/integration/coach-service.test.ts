import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProofViewUrlSpy: vi.fn(async () => ({ signedUrl: "https://proof.local/review.png" })),
}));

vi.mock("@/server/services/proof-service", () => ({
  getProofViewUrl: mocks.getProofViewUrlSpy,
}));

import { prisma } from "../../apps/web/src/db/client.ts";
import {
  getReviewQueue,
  getTeamOverview,
  getWeeklySettings,
} from "../../apps/web/src/server/services/coach-service.ts";
import {
  createUploadedProofImage,
  getCurrentWeekRange,
  seedBasicTeam,
} from "../setup/db-fixtures.ts";

describe("@smoke coach-service", () => {
  it("returns overview, review queue and weekly settings", async () => {
    const { team, coach, athleteA } = await seedBasicTeam(prisma);
    const { weekStartAt, weekEndAt } = getCurrentWeekRange();

    await prisma.weeklyRequirement.create({
      data: {
        teamId: team.id,
        weekStartAt,
        weekEndAt,
        requiredMinutes: 90,
      },
    });

    const proof = await createUploadedProofImage(prisma, athleteA.id, {
      validationStatus: "PENDING",
    });

    await prisma.proofExtractionJob.create({
      data: {
        proofImageId: proof.id,
        status: "PROCESSING",
      },
    });

    await prisma.trainingEntry.create({
      data: {
        athleteId: athleteA.id,
        activityType: "RUN",
        date: weekStartAt,
        minutes: 50,
        distance: 11,
        avgHr: 148,
        validationStatus: "PENDING",
        entryStatus: "ACTIVE",
        weekStartAt,
        proofImageId: proof.id,
        proofImages: {
          connect: [{ id: proof.id }],
        },
      },
    });

    const overview = await getTeamOverview(team.id, weekStartAt);
    expect(overview.teamId).toBe(team.id);
    expect(overview.pendingProofCount).toBe(1);
    expect(overview.leaderboard.length).toBeGreaterThan(0);

    const queue = await getReviewQueue(coach.id, team.id, weekStartAt);
    expect(queue.entries.length).toBe(1);
    expect(queue.entries[0]?.proofUrl).toBe("https://proof.local/review.png");

    const settings = await getWeeklySettings(team.id, weekStartAt);
    expect(settings.requiredMinutes).toBe(90);
    expect(settings.athletes.some((athlete) => athlete.id === athleteA.id)).toBe(true);
  });
});
