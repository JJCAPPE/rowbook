import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/db/client";
import { aggregateWeekForAthlete } from "@/server/services/weekly-service";
import { runInBackground } from "@/server/utils/background";

export type ReviewDecision =
  | {
      entryId: string;
      expectedVersion: number;
      decision: "VERIFIED";
    }
  | {
      entryId: string;
      expectedVersion: number;
      decision: "REJECTED";
      reason: string;
    };

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as Prisma.InputJsonValue;

export const reviewValidationStatus = async (
  actorId: string,
  decision: ReviewDecision,
) => {
  const reviewed = await prisma.$transaction(async (tx) => {
    const entry = await tx.trainingEntry.findUnique({
      where: { id: decision.entryId },
      include: {
        athlete: {
          select: {
            athleteProfile: { select: { teamId: true } },
          },
        },
      },
    });
    if (!entry) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workout not found." });
    }

    const teamId = entry.athlete.athleteProfile?.teamId;
    const membership = teamId
      ? await tx.coachTeamMembership.findUnique({
          where: { teamId_coachId: { teamId, coachId: actorId } },
          select: { teamId: true },
        })
      : null;
    if (!teamId || !membership) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    if (entry.version !== decision.expectedVersion) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This workout changed. Reload it before reviewing.",
      });
    }
    if (entry.reviewedAt || entry.reviewedById) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This workout has already been reviewed.",
      });
    }

    const reviewedAt = new Date();
    const rejectionNote =
      decision.decision === "REJECTED" ? decision.reason.trim() : null;
    const changed = await tx.trainingEntry.updateMany({
      where: {
        id: entry.id,
        version: decision.expectedVersion,
        reviewedAt: null,
        reviewedById: null,
      },
      data: {
        validationStatus: decision.decision,
        rejectionNote,
        reviewedAt,
        reviewedById: actorId,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This workout changed. Reload it before reviewing.",
      });
    }

    await tx.proofImage.updateMany({
      where: {
        OR: [
          { trainingEntryId: entry.id },
          ...(entry.proofImageId ? [{ id: entry.proofImageId }] : []),
        ],
      },
      data: {
        validationStatus: decision.decision,
        reviewedById: actorId,
      },
    });

    const updated = await tx.trainingEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        entityType: "TRAINING_ENTRY",
        entityId: entry.id,
        action: "REVIEW_VALIDATION",
        before: toInputJsonValue(entry),
        after: toInputJsonValue(updated),
      },
    });

    return { entry: updated, teamId };
  });

  runInBackground(
    "Post-review aggregate reconciliation failed",
    () =>
      aggregateWeekForAthlete(
        reviewed.teamId,
        reviewed.entry.athleteId,
        reviewed.entry.weekStartAt,
      ),
  );

  return reviewed.entry;
};
