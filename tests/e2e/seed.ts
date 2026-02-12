import { PrismaClient } from "@prisma/client";
import { getWeekRange, nowInZone } from "@rowbook/shared";

const prisma = new PrismaClient();

export const ensureE2ESeedData = async () => {
  const existingTeam = await prisma.team.findFirst({
    where: { name: "E2E Team" },
  });

  const team =
    existingTeam
    ?? (await prisma.team.create({
      data: {
        name: "E2E Team",
        timezone: "America/New_York",
      },
    }));

  const coach = await prisma.user.upsert({
    where: { email: "coach@test.local" },
    update: { role: "COACH", status: "ACTIVE", name: "Coach Tester" },
    create: {
      email: "coach@test.local",
      role: "COACH",
      status: "ACTIVE",
      name: "Coach Tester",
    },
  });

  const athleteA = await prisma.user.upsert({
    where: { email: "athlete-a@test.local" },
    update: { role: "ATHLETE", status: "ACTIVE", name: "Athlete A" },
    create: {
      email: "athlete-a@test.local",
      role: "ATHLETE",
      status: "ACTIVE",
      name: "Athlete A",
    },
  });

  const athleteB = await prisma.user.upsert({
    where: { email: "athlete-b@test.local" },
    update: { role: "ATHLETE", status: "ACTIVE", name: "Athlete B" },
    create: {
      email: "athlete-b@test.local",
      role: "ATHLETE",
      status: "ACTIVE",
      name: "Athlete B",
    },
  });

  await prisma.athleteProfile.upsert({
    where: { userId: athleteA.id },
    update: { teamId: team.id },
    create: { userId: athleteA.id, teamId: team.id },
  });
  await prisma.athleteProfile.upsert({
    where: { userId: athleteB.id },
    update: { teamId: team.id },
    create: { userId: athleteB.id, teamId: team.id },
  });

  const { weekStartAt, weekEndAt } = getWeekRange(nowInZone());
  await prisma.weeklyRequirement.upsert({
    where: {
      teamId_weekStartAt: {
        teamId: team.id,
        weekStartAt,
      },
    },
    update: {
      weekEndAt,
      requiredMinutes: 90,
    },
    create: {
      teamId: team.id,
      weekStartAt,
      weekEndAt,
      requiredMinutes: 90,
    },
  });

  const pendingProof = await prisma.proofImage.create({
    data: {
      athleteId: athleteA.id,
      storagePath: `${athleteA.id}/e2e-proof.png`,
      uploadedAt: new Date(),
      deleteAfter: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      validationStatus: "PENDING",
    },
  });

  const existingWeekEntries = await prisma.trainingEntry.findMany({
    where: {
      athleteId: athleteA.id,
      weekStartAt,
    },
    select: { id: true },
  });

  if (existingWeekEntries.length === 0) {
    await prisma.trainingEntry.create({
      data: {
        athleteId: athleteA.id,
        activityType: "RUN",
        date: weekStartAt,
        minutes: 45,
        distance: 10,
        avgHr: 150,
        validationStatus: "PENDING",
        entryStatus: "ACTIVE",
        weekStartAt,
        proofImageId: pendingProof.id,
        proofImages: {
          connect: [{ id: pendingProof.id }],
        },
      },
    });
  }

  return {
    team,
    coach,
    athleteA,
    athleteB,
    weekStartAt,
  };
};

export const disconnectE2ESeed = async () => {
  await prisma.$disconnect();
};
