import { prisma } from "@/db/client";
import type { Prisma } from "@prisma/client";
import { ActivityType, ValidationStatus, EntryStatus } from "@rowbook/shared";

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
) => {
  const rangeStart = new Date(weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  const rangeEnd = new Date(weekStartAt.getTime() + 12 * 60 * 60 * 1000);
  return prisma.trainingEntry.findMany({
    where: { 
      athleteId, 
      weekStartAt: { gte: rangeStart, lte: rangeEnd } 
    },
    include: { proofImages: true },
    orderBy: { date: "desc" },
  });
};

export const listEntriesByTeamWeek = (teamId: string, weekStartAt: Date) => {
  const rangeStart = new Date(weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  const rangeEnd = new Date(weekStartAt.getTime() + 12 * 60 * 60 * 1000);
  return prisma.trainingEntry.findMany({
    where: {
      weekStartAt: { gte: rangeStart, lte: rangeEnd },
      athlete: { athleteProfile: { teamId } },
    },
    include: { athlete: true },
  });
};

export const listEntriesByTeamSinceWeekStart = (
  teamId: string,
  weekStartAt: Date,
) => {
  const bufferedStart = new Date(weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  return prisma.trainingEntry.findMany({
    where: {
      weekStartAt: {
        gte: bufferedStart,
      },
      athlete: { athleteProfile: { teamId } },
    },
    include: { athlete: true },
    orderBy: { weekStartAt: "asc" },
  });
};

export const listEntriesByAthlete = (athleteId: string) =>
  prisma.trainingEntry.findMany({
    where: { athleteId },
    orderBy: { date: "desc" },
  });

export const listEntriesByAthleteSinceWeekStart = (
  athleteId: string,
  weekStartAt: Date,
) => {
  const bufferedStart = new Date(weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  return prisma.trainingEntry.findMany({
    where: {
      athleteId,
      weekStartAt: {
        gte: bufferedStart,
      },
    },
    include: { proofImages: true },
    orderBy: { date: "desc" },
  });
};

export const listEntriesForReview = (
  teamId: string,
  statuses: ValidationStatus[],
  options?: { includeReviewed?: boolean; dateRange?: { start: Date; end: Date } },
) => {
  const orFilters: Prisma.TrainingEntryWhereInput[] = [
    {
      validationStatus: { in: statuses },
    },
  ];

  if (options?.includeReviewed) {
    orFilters.push({
      validationStatus: { in: ["VERIFIED", "REJECTED"] as ValidationStatus[] },
      proofImage: {
        reviewedById: null,
        proofExtractionJob: { status: "COMPLETED" },
      },
    });
  }

  return prisma.trainingEntry.findMany({
    where: {
      ...(options?.dateRange && {
        date: {
          gte: options.dateRange.start,
          lt: options.dateRange.end,
        },
      }),
      athlete: {
        athleteProfile: { teamId },
      },
      OR: orFilters,
    },
    include: {
      athlete: true,
      proofImages: { include: { proofExtractionJob: true } },
    },
    orderBy: { date: "desc" },
  });
};
