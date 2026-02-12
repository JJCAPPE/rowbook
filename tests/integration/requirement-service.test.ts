import { describe, expect, it } from "vitest";

import { prisma } from "../../apps/web/src/db/client.ts";
import {
  getWeeklyRequirementsRange,
  removeExemption,
  setExemption,
  setWeeklyRequirement,
  setWeeklyRequirements,
} from "../../apps/web/src/server/services/requirement-service.ts";
import { getCurrentWeekRange, seedBasicTeam } from "../setup/db-fixtures.ts";

describe("@smoke requirement-service", () => {
  it("sets weekly requirements and manages exemptions", async () => {
    const { team, coach, athleteA } = await seedBasicTeam(prisma);
    const { weekStartAt } = getCurrentWeekRange();

    const single = await setWeeklyRequirement(coach.id, team.id, weekStartAt, 90);
    expect(single.requiredMinutes).toBe(90);

    const exemption = await setExemption(
      coach.id,
      athleteA.id,
      weekStartAt,
      "Travel",
      true,
    );
    expect(exemption.athleteId).toBe(athleteA.id);
    expect(exemption.isIndefinite).toBe(true);

    const rangeStart = new Date(weekStartAt);
    const rangeEnd = new Date(weekStartAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    const batch = await setWeeklyRequirements(coach.id, team.id, [
      { weekStartAt, requiredMinutes: 100 },
      { weekStartAt: new Date(weekStartAt.getTime() + 7 * 24 * 60 * 60 * 1000), requiredMinutes: 110 },
    ]);

    expect(batch).toHaveLength(2);

    const fetched = await getWeeklyRequirementsRange(team.id, rangeStart, rangeEnd);
    expect(fetched.length).toBeGreaterThanOrEqual(2);

    const removal = await removeExemption(coach.id, athleteA.id, weekStartAt);
    expect(removal.success).toBe(true);

    const fromDb = await prisma.exemption.findFirst({ where: { athleteId: athleteA.id } });
    expect(fromDb).toBeNull();
  });
});
