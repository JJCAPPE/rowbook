import { z } from "zod";
import {
  AthleteWeeklyRequirementOverrideInputSchema,
  ExemptionInputSchema,
  ValidationStatusSchema,
  WeeklyRequirementInputSchema,
} from "@rowbook/shared";
import { coachProcedure, router } from "@/server/trpc";
import { getAthleteDetail, getReviewQueue, getTeamOverview, getWeeklySettings } from "@/server/services/coach-service";
import {
  removeAthleteWeeklyRequirementOverride,
  getWeeklyRequirementsRange,
  removeExemption,
  setAthleteWeeklyRequirementOverride,
  setExemption,
  setWeeklyRequirement,
  setWeeklyRequirements,
} from "@/server/services/requirement-service";
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
    .query(({ ctx, input }) => getAthleteDetail(ctx.session.user.id, input.athleteId)),
  getReviewQueue: coachProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          weekStartAt: z.coerce.date().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => getReviewQueue(ctx.session.user.id, input?.teamId, input?.weekStartAt)),
  getWeeklySettings: coachProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          weekStartAt: z.coerce.date().optional(),
        })
        .optional(),
    )
    .query(({ input }) => getWeeklySettings(input?.teamId, input?.weekStartAt)),
  setWeeklyRequirement: coachProcedure
    .input(WeeklyRequirementInputSchema)
    .mutation(({ ctx, input }) =>
      setWeeklyRequirement(ctx.session.user.id, input.teamId, input.weekStartAt, input.requiredMinutes),
    ),
  getWeeklyRequirementsRange: coachProcedure
    .input(z.object({ teamId: z.string(), startAt: z.coerce.date(), endAt: z.coerce.date() }))
    .query(({ input }) => getWeeklyRequirementsRange(input.teamId, input.startAt, input.endAt)),
  setWeeklyRequirements: coachProcedure
    .input(
      z.object({
        teamId: z.string(),
        requirements: z.array(z.object({ weekStartAt: z.coerce.date(), requiredMinutes: z.number() })),
      }),
    )
    .mutation(({ ctx, input }) => setWeeklyRequirements(ctx.session.user.id, input.teamId, input.requirements)),
  setExemption: coachProcedure
    .input(ExemptionInputSchema)
    .mutation(({ ctx, input }) =>
      setExemption(ctx.session.user.id, input.athleteId, input.weekStartAt, input.reason ?? null, input.isIndefinite),
    ),
  setAthleteWeeklyRequirementOverride: coachProcedure
    .input(AthleteWeeklyRequirementOverrideInputSchema)
    .mutation(({ ctx, input }) =>
      setAthleteWeeklyRequirementOverride(
        ctx.session.user.id,
        input.athleteId,
        input.weekStartAt,
        input.requiredMinutes,
        input.reason ?? null,
      ),
    ),
  removeAthleteWeeklyRequirementOverride: coachProcedure
    .input(z.object({ overrideId: z.string() }))
    .mutation(({ ctx, input }) => removeAthleteWeeklyRequirementOverride(ctx.session.user.id, input.overrideId)),
  removeExemption: coachProcedure
    .input(z.object({ exemptionId: z.string() }))
    .mutation(({ ctx, input }) => removeExemption(ctx.session.user.id, input.exemptionId)),
  overrideValidationStatus: coachProcedure
    .input(z.object({ entryId: z.string(), status: ValidationStatusSchema, rejectionNote: z.string().optional().nullable() }))
    .mutation(({ ctx, input }) =>
      overrideValidationStatus(ctx.session.user.id, input.entryId, input.status, input.rejectionNote),
    ),
});
