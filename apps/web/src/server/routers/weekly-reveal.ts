import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc";
import { completeWeeklyReveal, getPendingWeeklyReveal } from "@/server/services/weekly-reveal-service";

export const weeklyRevealRouter = router({
  getPending: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).optional() }).optional())
    .query(({ ctx, input }) => getPendingWeeklyReveal(ctx.session.user, input?.teamId)),
  complete: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).optional(), weekStartAt: z.coerce.date() }))
    .mutation(({ ctx, input }) => completeWeeklyReveal(ctx.session.user, input)),
});
