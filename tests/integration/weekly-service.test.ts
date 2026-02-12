import { describe, expect, it } from "vitest";

import { prisma } from "../../apps/web/src/db/client.ts";
import {
  aggregateWeekForTeam,
  getTeamLeaderboard,
} from "../../apps/web/src/server/services/weekly-service.ts";
import { getCurrentWeekRange, seedBasicTeam } from "../setup/db-fixtures.ts";

describe("@smoke weekly-service", () => {
  it("aggregates statuses with requirement and exemptions", async () => {
    const { team, coach, athleteA, athleteB } = await seedBasicTeam(prisma);
    const { weekStartAt, weekEndAt } = getCurrentWeekRange();

    await prisma.weeklyRequirement.create({
      data: {
        teamId: team.id,
        weekStartAt,
        weekEndAt,
        requiredMinutes: 90,
      },
    });

    await prisma.trainingEntry.createMany({
      data: [
        {
          athleteId: athleteA.id,
          activityType: "ERG",
          date: weekStartAt,
          minutes: 100,
          distance: 24,
          avgHr: 150,
          validationStatus: "VERIFIED",
          entryStatus: "ACTIVE",
          weekStartAt,
        },
        {
          athleteId: athleteB.id,
          activityType: "RUN",
          date: weekStartAt,
          minutes: 60,
          distance: 12,
          avgHr: 145,
          validationStatus: "VERIFIED",
          entryStatus: "ACTIVE",
          weekStartAt,
        },
        {
          athleteId: athleteB.id,
          activityType: "RUN",
          date: weekStartAt,
          minutes: 120,
          distance: 20,
          avgHr: 155,
          validationStatus: "REJECTED",
          entryStatus: "ACTIVE",
          weekStartAt,
        },
      ],
    });

    await prisma.exemption.create({
      data: {
        athleteId: athleteB.id,
        weekStartAt,
        reason: "Injury",
        createdBy: coach.id,
      },
    });

    const aggregates = await aggregateWeekForTeam(team.id, weekStartAt);
    expect(aggregates).toHaveLength(2);

    const leaderboard = await getTeamLeaderboard(team.id, weekStartAt);
    const byId = new Map(leaderboard.map((row) => [row.athleteId, row]));

    expect(byId.get(athleteA.id)?.status).toBe("MET");
    expect(byId.get(athleteA.id)?.totalMinutes).toBe(100);
    expect(byId.get(athleteB.id)?.status).toBe("EXEMPT");
    expect(byId.get(athleteB.id)?.totalMinutes).toBe(60);
  });
});
