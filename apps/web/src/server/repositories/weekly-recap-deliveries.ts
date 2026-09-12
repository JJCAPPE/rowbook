import { randomUUID } from "node:crypto";

import { prisma } from "@/db/client";

const CLAIM_SCAN_LIMIT = 5;

const normalizeErrorCode = (code: string) =>
  /^[A-Z0-9_]{1,64}$/.test(code) ? code : "EMAIL_DELIVERY_FAILED";

export const listEligibleWeeklyRecapTeams = () =>
  prisma.team.findMany({
    where: {
      weeklyRecapEnabled: true,
      athletes: {
        some: {
          user: { status: "ACTIVE" },
        },
      },
    },
    select: {
      id: true,
      name: true,
      timezone: true,
    },
    orderBy: { id: "asc" },
  });

export const enqueueWeeklyRecapDeliveries = async (options: {
  teamId: string;
  weekStartAt: Date;
  templateVersion: string;
  now: Date;
}) => {
  const recipients = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        {
          role: "ATHLETE",
          athleteProfile: { teamId: options.teamId },
        },
        {
          role: { in: ["COACH", "ADMIN"] },
          coachedTeams: { some: { teamId: options.teamId } },
        },
      ],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (recipients.length === 0) {
    return { recipientCount: 0, createdCount: 0 };
  }

  const result = await prisma.weeklyRecapDelivery.createMany({
    data: recipients.map((recipient) => ({
      teamId: options.teamId,
      weekStartAt: options.weekStartAt,
      userId: recipient.id,
      templateVersion: options.templateVersion,
      nextAttemptAt: options.now,
    })),
    skipDuplicates: true,
  });

  return {
    recipientCount: recipients.length,
    createdCount: result.count,
  };
};

export const markExpiredWeeklyRecapLeasesUnknown = async (now: Date) => {
  const result = await prisma.weeklyRecapDelivery.updateMany({
    where: {
      status: "SENDING",
      leaseExpiresAt: { lte: now },
    },
    data: {
      status: "UNKNOWN",
      claimToken: null,
      leaseExpiresAt: null,
      lastErrorCode: "DELIVERY_LEASE_EXPIRED",
    },
  });

  return result.count;
};

export const claimNextWeeklyRecapDelivery = async (options: {
  weekStartAt: Date;
  now: Date;
  leaseMs: number;
  maxAttempts: number;
}) => {
  for (let scan = 0; scan < CLAIM_SCAN_LIMIT; scan += 1) {
    const candidate = await prisma.weeklyRecapDelivery.findFirst({
      where: {
        weekStartAt: options.weekStartAt,
        status: { in: ["PENDING", "FAILED"] },
        nextAttemptAt: { lte: options.now },
        attemptCount: { lt: options.maxAttempts },
      },
      select: { id: true, teamId: true },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });

    if (!candidate) return null;

    const claimToken = randomUUID();
    const leaseExpiresAt = new Date(options.now.getTime() + options.leaseMs);
    const claimed = await prisma.weeklyRecapDelivery.updateMany({
      where: {
        id: candidate.id,
        weekStartAt: options.weekStartAt,
        status: { in: ["PENDING", "FAILED"] },
        nextAttemptAt: { lte: options.now },
        attemptCount: { lt: options.maxAttempts },
      },
      data: {
        status: "SENDING",
        attemptCount: { increment: 1 },
        claimToken,
        leaseExpiresAt,
        lastErrorCode: null,
      },
    });

    if (claimed.count !== 1) continue;

    return prisma.weeklyRecapDelivery.findUniqueOrThrow({
      where: { id: candidate.id },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            timezone: true,
            weeklyRecapEnabled: true,
            athletes: {
              where: { user: { status: "ACTIVE" } },
              take: 1,
              select: { id: true },
            },
          },
        },
        recipient: {
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            athleteProfile: { select: { teamId: true } },
            coachedTeams: {
              where: { teamId: candidate.teamId },
              select: { teamId: true },
            },
          },
        },
      },
    });
  }

  return null;
};

export const markWeeklyRecapSent = async (options: {
  id: string;
  claimToken: string;
  provider: string;
  providerMessageId: string;
  sentAt: Date;
}) => {
  const result = await prisma.weeklyRecapDelivery.updateMany({
    where: {
      id: options.id,
      status: "SENDING",
      claimToken: options.claimToken,
    },
    data: {
      status: "SENT",
      provider: options.provider,
      providerMessageId: options.providerMessageId,
      sentAt: options.sentAt,
      claimToken: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
    },
  });

  return result.count === 1;
};

export const markWeeklyRecapFailed = async (options: {
  id: string;
  claimToken: string;
  errorCode: string;
  retryAt: Date;
  terminal: boolean;
  maxAttempts: number;
}) => {
  const result = await prisma.weeklyRecapDelivery.updateMany({
    where: {
      id: options.id,
      status: "SENDING",
      claimToken: options.claimToken,
    },
    data: {
      status: "FAILED",
      nextAttemptAt: options.retryAt,
      attemptCount: options.terminal ? options.maxAttempts : undefined,
      claimToken: null,
      leaseExpiresAt: null,
      lastErrorCode: normalizeErrorCode(options.errorCode),
    },
  });

  return result.count === 1;
};

export const markWeeklyRecapUnknown = async (options: {
  id: string;
  claimToken: string;
  errorCode: string;
  provider?: string;
  providerMessageId?: string;
}) => {
  const result = await prisma.weeklyRecapDelivery.updateMany({
    where: {
      id: options.id,
      status: "SENDING",
      claimToken: options.claimToken,
    },
    data: {
      status: "UNKNOWN",
      claimToken: null,
      leaseExpiresAt: null,
      lastErrorCode: normalizeErrorCode(options.errorCode),
      provider: options.provider,
      providerMessageId: options.providerMessageId,
    },
  });

  return result.count === 1;
};
