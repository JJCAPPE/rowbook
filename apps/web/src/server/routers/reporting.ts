import { z } from "zod";
import { coachProcedure, router } from "@/server/trpc";
import { getDefaultTeam } from "@/server/repositories/teams";
import { exportWeeklyCsv, getTeamTrends } from "@/server/services/reporting-service";

export const reportingRouter = router({
  getTeamTrends: coachProcedure
    .input(z.object({ teamId: z.string().optional(), limit: z.number().int().optional() }).optional())
    .query(async ({ input }) => {
      const team = input?.teamId ? { id: input.teamId } : await getDefaultTeam();
      if (!team) {
        throw new Error("Team not found.");
      }
      return getTeamTrends(team.id, input?.limit);
    }),
  exportCsv: coachProcedure
    .input(z.object({ teamId: z.string().optional(), weekStartAt: z.coerce.date() }))
    .query(async ({ input }) => {
      const team = input.teamId ? { id: input.teamId } : await getDefaultTeam();
      if (!team) {
        throw new Error("Team not found.");
      }
      return exportWeeklyCsv(team.id, input.weekStartAt);
    }),
});
