import { z } from "zod";
import {
  AthleteWeeklyRequirementOverrideInputSchema,
  ExemptionInputSchema,
  WeeklyRequirementInputSchema,
} from "@rowbook/shared";
import { coachProcedure, router } from "@/server/trpc";
import {
  getAthleteDetail,
  getReviewEvidence,
  getReviewQueue,
  getTeamOverview,
  getWeeklySettings,
  listCoachTeamAthletes,
  listCoachTeams,
} from "@/server/services/coach-service";
import {
  removeAthleteWeeklyRequirementOverride,
  getWeeklyRequirementsRange,
  removeExemption,
  saveAthleteWeeklySetting,
  setAthleteWeeklyRequirementOverride,
  setExemption,
  setWeeklyRequirement,
  setWeeklyRequirements,
} from "@/server/services/requirement-service";
import { reviewValidationStatus } from "@/server/services/validation-service";

const ReviewDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    entryId: z.string().min(1),
    expectedVersion: z.number().int().positive(),
    decision: z.literal("VERIFIED"),
  }),
  z.object({
    entryId: z.string().min(1),
    expectedVersion: z.number().int().positive(),
    decision: z.literal("REJECTED"),
    reason: z.string().trim().min(1).max(500),
  }),
]);

export const coachRouter = router({
  listTeams: coachProcedure.query(({ ctx }) =>
    listCoachTeams(ctx.session.user.id),
  ),
  listAthletes: coachProcedure
    .input(z.object({ teamId: z.string().optional() }).optional())
    .query(({ ctx, input }) =>
      listCoachTeamAthletes(ctx.session.user.id, input?.teamId),
    ),
  getTeamOverview: coachProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          weekStartAt: z.coerce.date().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) =>
      getTeamOverview(ctx.session.user.id, input?.teamId, input?.weekStartAt),
    ),
  getAthleteDetail: coachProcedure
    .input(z.object({ athleteId: z.string(), teamId: z.string().optional() }))
    .query(({ ctx, input }) =>
      getAthleteDetail(ctx.session.user.id, input.athleteId, input.teamId),
    ),
  getReviewQueue: coachProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          weekStartAt: z.coerce.date().optional(),
          state: z
            .enum(["NEEDS_REVIEW", "CHECKING", "COMPLETED"])
            .default("NEEDS_REVIEW"),
          cursor: z.string().optional(),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      getReviewQueue(
        ctx.session.user.id,
        input?.teamId,
        input?.weekStartAt,
        input?.state,
        input?.cursor,
        input?.limit,
      ),
    ),
  getReviewEvidence: coachProcedure
    .input(
      z.object({
        entryId: z.string().min(1),
        expectedVersion: z.number().int().positive(),
      }),
    )
    .query(({ ctx, input }) =>
      getReviewEvidence(
        ctx.session.user.id,
        input.entryId,
        input.expectedVersion,
      ),
    ),
  getWeeklySettings: coachProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          weekStartAt: z.coerce.date().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      getWeeklySettings(ctx.session.user.id, input?.teamId, input?.weekStartAt),
    ),
  setWeeklyRequirement: coachProcedure
    .input(WeeklyRequirementInputSchema)
    .mutation(({ ctx, input }) =>
      setWeeklyRequirement(
        ctx.session.user.id,
        input.teamId,
        input.weekStartAt,
        input.requiredMinutes,
      ),
    ),
  getWeeklyRequirementsRange: coachProcedure
    .input(
      z.object({
        teamId: z.string(),
        startAt: z.coerce.date(),
        endAt: z.coerce.date(),
      }),
    )
    .query(({ ctx, input }) =>
      getWeeklyRequirementsRange(
        ctx.session.user.id,
        input.teamId,
        input.startAt,
        input.endAt,
      ),
    ),
  setWeeklyRequirements: coachProcedure
    .input(
      z.object({
        teamId: z.string(),
        requirements: z
          .array(
            z.object({
              weekStartAt: z.coerce.date(),
              requiredMinutes: z.number().int().min(0).max(10_080),
            }),
          )
          .min(1)
          .max(52),
      }),
    )
    .mutation(({ ctx, input }) =>
      setWeeklyRequirements(
        ctx.session.user.id,
        input.teamId,
        input.requirements,
      ),
    ),
  setExemption: coachProcedure
    .input(ExemptionInputSchema)
    .mutation(({ ctx, input }) =>
      setExemption(
        ctx.session.user.id,
        input.athleteId,
        input.weekStartAt,
        input.reason ?? null,
        input.isIndefinite,
      ),
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
  saveAthleteWeeklySetting: coachProcedure
    .input(
      z.object({
        teamId: z.string().min(1),
        athleteId: z.string().min(1),
        weekStartAt: z.coerce.date(),
        mode: z.enum(["NONE", "WEEK", "INDEFINITE"]),
        requiredMinutes: z.number().int().min(0).max(10_080).nullable(),
        reason: z.string().trim().max(500).nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      saveAthleteWeeklySetting(ctx.session.user.id, input),
    ),
  removeAthleteWeeklyRequirementOverride: coachProcedure
    .input(z.object({ overrideId: z.string() }))
    .mutation(({ ctx, input }) =>
      removeAthleteWeeklyRequirementOverride(
        ctx.session.user.id,
        input.overrideId,
      ),
    ),
  removeExemption: coachProcedure
    .input(z.object({ exemptionId: z.string() }))
    .mutation(({ ctx, input }) =>
      removeExemption(ctx.session.user.id, input.exemptionId),
    ),
  overrideValidationStatus: coachProcedure
    .input(ReviewDecisionSchema)
    .mutation(({ ctx, input }) =>
      reviewValidationStatus(ctx.session.user.id, input),
    ),
});
