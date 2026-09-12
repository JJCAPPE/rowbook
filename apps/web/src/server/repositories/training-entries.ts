import { prisma } from "@/db/client";
import type { Prisma } from "@prisma/client";
import { ActivityType, ValidationStatus, EntryStatus } from "@rowbook/shared";

const athleteEntrySelect = {
  id: true,
  athleteId: true,
  activityType: true,
  date: true,
  minutes: true,
  distance: true,
  avgHr: true,
  avgPace: true,
  avgWatts: true,
  notes: true,
  validationStatus: true,
  entryStatus: true,
  weekStartAt: true,
  lockedAt: true,
  rejectionNote: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  evidenceExtractionJob: {
    select: { result: true },
  },
  proofImages: {
    where: { uploadedAt: { not: null }, deletedAt: null },
    select: {
      id: true,
      originalFileName: true,
      extractedFields: true,
      validationStatus: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.TrainingEntrySelect;

export const createTrainingEntry = (data: {
  athleteId: string;
  activityType: ActivityType;
  date: Date;
  minutes: number;
  distance: number;
  avgHr?: number | null;
  avgPace?: number | null;
  avgWatts?: number | null;
  notes?: string | null;
  proofImageIds: string[];
  validationStatus: ValidationStatus;
  entryStatus: EntryStatus;
  weekStartAt: Date;
  lockedAt?: Date | null;
}) =>
  prisma.trainingEntry.create({
    data: {
      athleteId: data.athleteId,
      activityType: data.activityType,
      date: data.date,
      minutes: data.minutes,
      distance: data.distance,
      avgHr: data.avgHr,
      avgPace: data.avgPace,
      avgWatts: data.avgWatts,
      notes: data.notes,
      // Connect multiple proof images
      proofImages: {
        connect: data.proofImageIds.map((id) => ({ id })),
      },
      // Set legacy field for backward compatibility if needed (using first image) or leave optional
      proofImageId: data.proofImageIds[0] ?? undefined,
      validationStatus: data.validationStatus,
      entryStatus: data.entryStatus,
      weekStartAt: data.weekStartAt,
      lockedAt: data.lockedAt,
    },
  });

export const updateTrainingEntry = (
  id: string,
  data: Partial<{
    activityType: ActivityType;
    date: Date;
    minutes: number;
    distance: number;
    avgHr: number | null;
    avgPace: number | null;
    avgWatts: number | null;
    notes: string | null;
    validationStatus: ValidationStatus;
    entryStatus: EntryStatus;
    lockedAt: Date | null;
    rejectionNote: string | null;
  }>,
) =>
  prisma.trainingEntry.update({
    where: { id },
    data,
  });

export const deleteTrainingEntry = (id: string) =>
  prisma.trainingEntry.delete({ where: { id } });

export const getTrainingEntryById = (id: string) =>
  prisma.trainingEntry.findUnique({
    where: { id },
    include: { proofImages: true },
  });

export const getTrainingEntryByProofImageId = (proofImageId: string) =>
  prisma.trainingEntry.findFirst({
    where: {
      OR: [
        { proofImages: { some: { id: proofImageId } } },
        { proofImageId }, // Legacy fallback
      ],
    },
    include: { proofImages: true },
  });

export const updateTrainingEntriesByProofImageId = (
  proofImageId: string,
  data: Partial<{
    validationStatus: ValidationStatus;
    entryStatus: EntryStatus;
  }>,
) =>
  prisma.trainingEntry.updateMany({
    where: { proofImageId },
    data,
  });

export const listEntriesByAthleteWeek = (
  athleteId: string,
  weekStartAt: Date,
  weekEndAt: Date,
) => {
  return prisma.trainingEntry.findMany({
    where: { 
      athleteId, 
      weekStartAt: { gte: weekStartAt, lt: weekEndAt },
    },
    select: athleteEntrySelect,
    orderBy: { date: "desc" },
  });
};

export const listEntriesByTeamWeek = (teamId: string, weekStartAt: Date, weekEndAt: Date) => {
  return prisma.trainingEntry.findMany({
    where: {
      weekStartAt: { gte: weekStartAt, lt: weekEndAt },
      athlete: { athleteProfile: { teamId } },
    },
    include: { athlete: true },
  });
};

export const listEntriesByTeamSinceWeekStart = (
  teamId: string,
  weekStartAt: Date,
) => {
  return prisma.trainingEntry.findMany({
    where: {
      weekStartAt: {
        gte: weekStartAt,
      },
      athlete: { athleteProfile: { teamId } },
    },
    include: { athlete: true },
    orderBy: { weekStartAt: "asc" },
  });
};

export const listEntriesByAthlete = (athleteId: string, limit = 100) =>
  prisma.trainingEntry.findMany({
    where: { athleteId },
    select: athleteEntrySelect,
    orderBy: { date: "desc" },
    take: limit,
  });

export const listEntriesByAthleteSinceWeekStart = (
  athleteId: string,
  weekStartAt: Date,
  weekEndAt?: Date,
) => {
  return prisma.trainingEntry.findMany({
    where: {
      athleteId,
      weekStartAt: {
        gte: weekStartAt,
        ...(weekEndAt ? { lt: weekEndAt } : {}),
      },
    },
    select: athleteEntrySelect,
    orderBy: { date: "desc" },
  });
};

export const listEntriesForReview = (
  teamId: string,
  options: {
    weekStartAt: Date;
    weekEndAt: Date;
    state: "NEEDS_REVIEW" | "CHECKING" | "COMPLETED";
    cursor?: string;
    limit: number;
  },
) => {
  const stateFilter: Prisma.TrainingEntryWhereInput =
    options.state === "COMPLETED"
      ? { reviewedAt: { not: null } }
      : options.state === "CHECKING"
        ? {
            reviewedAt: null,
            validationStatus: { in: ["NOT_CHECKED", "PENDING"] },
            evidenceExtractionJob: {
              status: { in: ["NOT_CHECKED", "PENDING", "PROCESSING"] },
            },
          }
        : {
            reviewedAt: null,
            OR: [
              { validationStatus: "EXTRACTION_INCOMPLETE" },
              {
                validationStatus: "PENDING",
                evidenceExtractionJob: { status: { in: ["COMPLETED", "FAILED"] } },
              },
              {
                validationStatus: { in: ["NOT_CHECKED", "PENDING"] },
                evidenceExtractionJob: null,
              },
            ],
          };

  return prisma.trainingEntry.findMany({
    where: {
      weekStartAt: {
        gte: options.weekStartAt,
        lt: options.weekEndAt,
      },
      athlete: { athleteProfile: { teamId } },
      ...stateFilter,
    },
    select: {
      id: true,
      activityType: true,
      minutes: true,
      distance: true,
      avgHr: true,
      avgPace: true,
      avgWatts: true,
      notes: true,
      date: true,
      validationStatus: true,
      rejectionNote: true,
      reviewedAt: true,
      version: true,
      createdAt: true,
      athlete: { select: { name: true } },
      evidenceExtractionJob: {
        select: {
          status: true,
          result: true,
          failureCode: true,
          lastError: true,
        },
      },
      proofImages: {
        where: { uploadedAt: { not: null }, deletedAt: null },
        select: {
          id: true,
          originalFileName: true,
          extractedFields: true,
          validationStatus: true,
          reviewedById: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    take: options.limit + 1,
  });
};;
