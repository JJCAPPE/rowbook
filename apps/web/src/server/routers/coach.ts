import { z } from "zod";
import { ExemptionInputSchema, ValidationStatusSchema, WeeklyRequirementInputSchema } from "@rowbook/shared";
import { coachProcedure, router } from "@/server/trpc";
import { getAthleteDetail, getTeamOverview } from "@/server/services/coach-service";
import { setExemption, setWeeklyRequirement } from "@/server/services/requirement-service";
import { overrideValidationStatus } from "@/server/services/validation-service";

export const coachRouter = router({
  getTeamOverview: coachProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          weekStartAt: z.coerce.date().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => getTeamOverview(input?.teamId, input?.weekStartAt)),
  getAthleteDetail: coachProcedure
    .input(z.object({ athleteId: z.string() }))
    .query(({ input }) => getAthleteDetail(input.athleteId)),
  setWeeklyRequirement: coachProcedure
    .input(WeeklyRequirementInputSchema)
    .mutation(({ ctx, input }) =>
      setWeeklyRequirement(ctx.session.user.id, input.teamId, input.weekStartAt, input.requiredMinutes),
    ),
  setExemption: coachProcedure
    .input(ExemptionInputSchema)
    .mutation(({ ctx, input }) =>
      setExemption(ctx.session.user.id, input.athleteId, input.weekStartAt, input.reason ?? null),
    ),
  overrideValidationStatus: coachProcedure
    .input(z.object({ entryId: z.string(), status: ValidationStatusSchema }))
    .mutation(({ ctx, input }) =>
      overrideValidationStatus(ctx.session.user.id, input.entryId, input.status),
    ),
});
