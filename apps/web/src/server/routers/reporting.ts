import { z } from "zod";
import { coachProcedure, router } from "@/server/trpc";
import { prisma } from "@/db/client";
import { exportWeeklyCsv, getTeamTrends } from "@/server/services/reporting-service";

const getAuthorizedTeam = (actorId: string, teamId?: string) =>
  prisma.team.findFirst({
    where: {
      ...(teamId ? { id: teamId } : {}),
      coaches: { some: { coachId: actorId } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

export const reportingRouter = router({
  getTeamTrends: coachProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          limit: z.number().int().min(1).max(52).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const team = await getAuthorizedTeam(ctx.session.user.id, input?.teamId);
      if (!team) {
        throw new Error("Team not found.");
      }
      return getTeamTrends(team.id, input?.limit);
    }),
  exportCsv: coachProcedure
    .input(z.object({ teamId: z.string().optional(), weekStartAt: z.coerce.date() }))
    .query(async ({ ctx, input }) => {
      const team = await getAuthorizedTeam(ctx.session.user.id, input.teamId);
      if (!team) {
        throw new Error("Team not found.");
      }
      return exportWeeklyCsv(team.id, input.weekStartAt);
    }),
});
