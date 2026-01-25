import { prisma } from "@/db/client";
import { ActivityType, ValidationStatus, EntryStatus } from "@rowbook/shared";

export const createTrainingEntry = (data: {
  athleteId: string;
  activityType: ActivityType;
  date: Date;
  minutes: number;
  distance: number;
  avgHr?: number | null;
  notes?: string | null;
  proofImageId: string;
  validationStatus: ValidationStatus;
  entryStatus: EntryStatus;
  weekStartAt: Date;
  lockedAt?: Date | null;
}) =>
  prisma.trainingEntry.create({
    data,
  });

export const updateTrainingEntry = (id: string, data: Partial<{
  activityType: ActivityType;
  date: Date;
  minutes: number;
  distance: number;
  avgHr: number | null;
  notes: string | null;
  validationStatus: ValidationStatus;
  entryStatus: EntryStatus;
  lockedAt: Date | null;
}>) =>
  prisma.trainingEntry.update({
    where: { id },
    data,
  });

export const deleteTrainingEntry = (id: string) =>
  prisma.trainingEntry.delete({ where: { id } });

export const getTrainingEntryById = (id: string) =>
  prisma.trainingEntry.findUnique({
    where: { id },
    include: { proofImage: true },
  });

export const listEntriesByAthleteWeek = (athleteId: string, weekStartAt: Date) =>
  prisma.trainingEntry.findMany({
    where: { athleteId, weekStartAt },
    orderBy: { date: "desc" },
  });

export const listEntriesByTeamWeek = (teamId: string, weekStartAt: Date) =>
  prisma.trainingEntry.findMany({
    where: {
      weekStartAt,
      athlete: { athleteProfile: { teamId } },
    },
    include: { athlete: true },
  });

export const listEntriesByAthlete = (athleteId: string) =>
  prisma.trainingEntry.findMany({
    where: { athleteId },
    orderBy: { date: "desc" },
  });

export const listEntriesForReview = (
  teamId: string,
  weekStartAt: Date,
  statuses: ValidationStatus[],
) =>
  prisma.trainingEntry.findMany({
    where: {
      weekStartAt,
      validationStatus: { in: statuses },
      athlete: {
        athleteProfile: { teamId },
      },
    },
    include: { athlete: true },
    orderBy: { date: "desc" },
  });
