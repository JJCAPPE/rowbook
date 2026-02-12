import { PrismaClient } from "@prisma/client";
import { getWeekRange, nowInZone } from "@rowbook/shared";

let seedCounter = 0;

const nextSeedToken = () => {
  seedCounter += 1;
  return `${Date.now()}-${seedCounter}`;
};

export const createTeam = async (prisma: PrismaClient, name = "Test Team") =>
  prisma.team.create({
    data: {
      name,
      timezone: "America/New_York",
    },
  });

export const createUser = async (
  prisma: PrismaClient,
  input: {
    email: string;
    role: "ATHLETE" | "COACH" | "ADMIN";
    name?: string | null;
    status?: "ACTIVE" | "INACTIVE";
  },
) =>
  prisma.user.create({
    data: {
      email: input.email,
      role: input.role,
      name: input.name ?? null,
      status: input.status ?? "ACTIVE",
    },
  });

export const createAthlete = async (
  prisma: PrismaClient,
  input: {
    email: string;
    name: string;
    teamId: string;
    status?: "ACTIVE" | "INACTIVE";
  },
) => {
  const user = await createUser(prisma, {
    email: input.email,
    role: "ATHLETE",
    name: input.name,
    status: input.status,
  });

  await prisma.athleteProfile.create({
    data: {
      userId: user.id,
      teamId: input.teamId,
    },
  });

  return user;
};

export const seedBasicTeam = async (prisma: PrismaClient) => {
  const seedToken = nextSeedToken();
  const team = await createTeam(prisma, `Rowbook Test Team ${seedToken}`);
  const coach = await createUser(prisma, {
    email: `coach+${seedToken}@test.local`,
    role: "COACH",
    name: "Coach Tester",
  });
  const athleteA = await createAthlete(prisma, {
    email: `athlete-a+${seedToken}@test.local`,
    name: "Athlete A",
    teamId: team.id,
  });
  const athleteB = await createAthlete(prisma, {
    email: `athlete-b+${seedToken}@test.local`,
    name: "Athlete B",
    teamId: team.id,
  });

  return {
    team,
    coach,
    athleteA,
    athleteB,
  };
};

export const getCurrentWeekRange = () => getWeekRange(nowInZone());

export const createUploadedProofImage = async (
  prisma: PrismaClient,
  athleteId: string,
  overrides?: Partial<{
    storagePath: string;
    validationStatus: "NOT_CHECKED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXTRACTION_INCOMPLETE";
    deleteAfter: Date;
  }>,
) =>
  prisma.proofImage.create({
    data: {
      athleteId,
      storagePath:
        overrides?.storagePath ?? `${athleteId}/proof-${Math.random().toString(36).slice(2)}.png`,
      uploadedAt: new Date(),
      deleteAfter: overrides?.deleteAfter ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      validationStatus: overrides?.validationStatus ?? "NOT_CHECKED",
    },
  });
