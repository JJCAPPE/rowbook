import { prisma } from "@/db/client";

export const getUserById = (id: string) =>
  prisma.user.findUnique({ where: { id } });

export const getUserByEmail = (email: string) =>
  prisma.user.findUnique({ where: { email } });

export const listTeamAthletes = (teamId: string) =>
  prisma.user.findMany({
    where: { athleteProfile: { teamId } },
    include: { athleteProfile: true },
  });

export const getTeamIdForAthlete = async (userId: string) => {
  const profile = await prisma.athleteProfile.findUnique({
    where: { userId },
    select: { teamId: true },
  });
  return profile?.teamId ?? null;
};
