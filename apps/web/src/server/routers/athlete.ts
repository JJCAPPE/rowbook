import { TRPCError } from "@trpc/server";
import { TrainingEntryInputSchema, TrainingEntryUpdateSchema } from "@rowbook/shared";
import { isAthleteRole } from "@/server/auth/rbac";
import { getAthleteDashboard, getAthleteHistory } from "@/server/services/athlete-service";
import { createEntry, deleteEntry, updateEntry } from "@/server/services/entries-service";
import { protectedProcedure, router } from "@/server/trpc";
import { z } from "zod";

export const athleteRouter = router({
  getDashboard: protectedProcedure.query(async ({ ctx }) => {
    if (!isAthleteRole(ctx.session.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return getAthleteDashboard(ctx.session.user.id);
  }),
  getHistory: protectedProcedure.query(async ({ ctx }) => {
    if (!isAthleteRole(ctx.session.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return getAthleteHistory(ctx.session.user.id);
  }),
  createEntry: protectedProcedure
    .input(TrainingEntryInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isAthleteRole(ctx.session.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return createEntry(ctx.session.user.id, input);
    }),
  updateEntry: protectedProcedure
    .input(TrainingEntryUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isAthleteRole(ctx.session.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return updateEntry(ctx.session.user.id, input);
    }),
  deleteEntry: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!isAthleteRole(ctx.session.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return deleteEntry(ctx.session.user.id, input.id);
    }),
});
