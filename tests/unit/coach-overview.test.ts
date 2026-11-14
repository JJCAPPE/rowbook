import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { getWeekStartAt } from "@rowbook/shared";

import { prisma } from "../../apps/web/src/db/client.ts";
import { getTeamOverview } from "../../apps/web/src/server/services/coach-service.ts";

const mockQuery = (t: TestContext, delegate: object, method: string, result: unknown) => {
  const queries = delegate as Record<string, () => Promise<unknown>>;
  const original = queries[method];
  const mock = t.mock.fn(async () => result);
  queries[method] = mock;
  t.after(() => { queries[method] = original; });
  return mock;
};

test("coach overview keeps the team requirement without rereading athlete targets", async (t) => {
  for (const requiredMinutes of [240, 0, null]) {
    await t.test(`requirement ${requiredMinutes ?? "missing"}`, async (child) => {
      mockQuery(child, prisma.team, "findFirst", { id: "team-1" });
      mockQuery(child, prisma.user, "findMany", []);
      mockQuery(child, prisma.trainingEntry, "findMany", []);
      mockQuery(child, prisma.weeklyRequirement, "findFirst",
        requiredMinutes === null ? null : { requiredMinutes },
      );
      const exemptions = mockQuery(child, prisma.exemption, "findMany", []);
      const overrides = mockQuery(child, prisma.athleteWeeklyRequirementOverride, "findMany", []);

      const overview = await getTeamOverview(
        "coach-1", "team-1", getWeekStartAt(new Date("2026-11-10T12:00:00Z")),
      );

      assert.equal(overview.requiredMinutes, requiredMinutes ?? 0);
      assert.equal(exemptions.mock.callCount(), 1);
      assert.equal(overrides.mock.callCount(), 1);
    });
  }
});
