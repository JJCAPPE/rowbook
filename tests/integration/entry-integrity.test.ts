import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import {
  getPreviousWeekStartAt,
  getProofRetentionDeleteAfter,
  getWeekEndAt,
  getWeekStartAt,
  nowInZone,
} from "@rowbook/shared";

const databaseUrl = process.env.DATABASE_URL ?? "";
assert.match(
  databaseUrl,
  /\/rowbook_season_test(?:\?|$)/,
  "Integration tests refuse to run unless DATABASE_URL targets rowbook_season_test.",
);
process.env.ROWBOOK_DISABLE_BACKGROUND_JOBS = "1";

const prisma = new PrismaClient();
const { createEntry, deleteEntry, updateEntry } = await import(
  "../../apps/web/src/server/services/entries-service.ts"
);
const { aggregateWeekForAthlete, getTeamLeaderboard } = await import(
  "../../apps/web/src/server/services/weekly-service.ts"
);
const {
  getAthleteDashboard,
  getAthleteHistory,
  getAthleteHistoryWithEntries,
} = await import("../../apps/web/src/server/services/athlete-service.ts");
const { getAthleteDetail } = await import(
  "../../apps/web/src/server/services/coach-service.ts"
);
const { exportWeeklyCsv, getTeamTrends } = await import(
  "../../apps/web/src/server/services/reporting-service.ts"
);
const { reviewValidationStatus } = await import(
  "../../apps/web/src/server/services/validation-service.ts"
);
const {
  cleanupExpiredProofImageCandidate,
  cleanupExpiredProofImages,
} = await import("../../apps/web/src/server/services/proof-service.ts");
const { listExpiredProofImages } = await import(
  "../../apps/web/src/server/repositories/proof-images.ts"
);
const {
  claimNextEvidenceExtractionJob,
  finalizeEvidenceExtractionJob,
  recordEvidenceExtractionFailure,
} = await import(
  "../../apps/web/src/server/repositories/evidence-extraction-jobs.ts"
);
const { runWeeklyAggregation, runWeeklyRecapDelivery } = await import(
  "../../apps/web/src/server/jobs/weekly-aggregation.ts"
);
const { getWeeklyRecapWindow } = await import(
  "../../apps/web/src/server/jobs/weekly-recap-window.ts"
);
const { EmailDeliveryError } = await import(
  "../../apps/web/src/server/services/email-service.ts"
);
const [{ coachRouter }, { proofRouter }, { reportingRouter }] = await Promise.all([
  import("../../apps/web/src/server/routers/coach.ts"),
  import("../../apps/web/src/server/routers/proof.ts"),
  import("../../apps/web/src/server/routers/reporting.ts"),
]);

const createAuthenticatedCaller = (user: {
  id: string;
  email: string;
  name: string | null;
  role: "ATHLETE" | "COACH" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
}) => {
  const context = {
    req: new Request("http://localhost/api/trpc"),
    responseHeaders: {},
    setCookie: () => undefined,
    session: {
      user,
      expiresAt: new Date(Date.now() + 60_000),
    },
  };

  return {
    coach: coachRouter.createCaller(context),
    proof: proofRouter.createCaller(context),
    reporting: reportingRouter.createCaller(context),
  };
};

const assertAccessDenied = async (operation: () => Promise<unknown>) => {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(
      error.message,
      /access denied|forbidden|not found|unavailable/i,
    );
    return true;
  });
};

const resetDatabase = async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "WeeklyRecapDelivery",
      "CoachTeamMembership",
      "EvidenceExtractionJob",
      "ProofExtractionJob",
      "WeeklyAggregate",
      "AuditLog",
      "TrainingEntry",
      "ProofImage",
      "AthleteWeeklyRequirementOverride",
      "Exemption",
      "WeeklyRequirement",
      "AthleteProfile",
      "Session",
      "ExternalActivity",
      "ConnectedAccount",
      "Team",
      "User"
    CASCADE
  `);
};

const seedSubmission = async () => {
  const athleteId = randomUUID();
  const coachId = randomUUID();
  const teamId = randomUUID();
  const clientSubmissionId = randomUUID();
  const proofImageId = randomUUID();

  await prisma.team.create({ data: { id: teamId, name: "Test team" } });
  await prisma.user.createMany({
    data: [
      { id: athleteId, email: `${athleteId}@example.test`, role: "ATHLETE" },
      { id: coachId, email: `${coachId}@example.test`, role: "COACH" },
    ],
  });
  await prisma.athleteProfile.create({
    data: { userId: athleteId, teamId },
  });
  await prisma.coachTeamMembership.create({
    data: { teamId, coachId },
  });
  await prisma.proofImage.create({
    data: {
      id: proofImageId,
      athleteId,
      clientSubmissionId,
      storagePath: `${athleteId}/${proofImageId}/proof.jpg`,
      originalFileName: "proof.jpg",
      declaredSize: 100,
      declaredMimeType: "image/jpeg",
      verifiedSize: 100,
      verifiedMimeType: "image/jpeg",
      contentSha256: "a".repeat(64),
      uploadedAt: new Date(),
      deleteAfter: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return {
    athleteId,
    coachId,
    teamId,
    clientSubmissionId,
    proofImageId,
    input: {
      clientSubmissionId,
      activityType: "ERG" as const,
      date: nowInZone().startOf("day").plus({ hours: 12 }).toJSDate(),
      minutes: 30,
      distance: 7.5,
      avgHr: 145,
      notes: "Steady row",
      proofImageIds: [proofImageId],
      proofOcr: {
        extractedFields: {
          date: "2099-01-01",
          minutes: 999,
          distance: 999,
        },
      },
    },
  };
};

const seedWeeklyRecap = async (options: {
  now: Date;
  createDelivery: boolean;
  status?: "PENDING" | "FAILED";
  attemptCount?: number;
  nextAttemptAt?: Date;
}) => {
  const teamId = randomUUID();
  const athleteId = randomUUID();
  const { recapWeekStartAt } = getWeeklyRecapWindow(options.now);
  const previousWeekStartAt = getPreviousWeekStartAt(recapWeekStartAt);

  await prisma.team.create({
    data: { id: teamId, name: "Recap test team", weeklyRecapEnabled: true },
  });
  await prisma.user.create({
    data: {
      id: athleteId,
      email: `${athleteId}@example.test`,
      name: "Retry Athlete",
      role: "ATHLETE",
    },
  });
  await prisma.athleteProfile.create({
    data: { userId: athleteId, teamId },
  });
  await prisma.weeklyAggregate.createMany({
    data: [recapWeekStartAt, previousWeekStartAt].map((weekStartAt) => ({
      athleteId,
      teamId,
      weekStartAt,
      weekEndAt: getWeekEndAt(weekStartAt),
      totalMinutes: 0,
      totalDistance: 0,
      activityTypes: [],
      hasHrData: false,
      status: "MET",
    })),
  });

  const delivery = options.createDelivery
    ? await prisma.weeklyRecapDelivery.create({
        data: {
          teamId,
          weekStartAt: recapWeekStartAt,
          userId: athleteId,
          templateVersion: "weekly-recap-v2",
          status: options.status ?? "PENDING",
          attemptCount: options.attemptCount ?? 0,
          nextAttemptAt: options.nextAttemptAt ?? options.now,
        },
      })
    : null;

  return { teamId, athleteId, recapWeekStartAt, delivery };
};

test("entry save, edit, and review preserve integrity under retries and races", async (t) => {
  await resetDatabase();
  t.after(async () => {
    await resetDatabase();
    await prisma.$disconnect();
  });

  const seeded = await seedSubmission();

  await t.test("service rejects an oversized proof set before saving", async () => {
    await assert.rejects(
      () =>
        createEntry(seeded.athleteId, {
          ...seeded.input,
          proofImageIds: Array.from({ length: 7 }, (_, index) => `proof-${index}`),
        }),
      /at most 6 proof images/,
    );
    assert.equal(await prisma.trainingEntry.count(), 0);
  });

  await t.test("service rejects proof that expired before attachment", async () => {
    const clientSubmissionId = randomUUID();
    const proofImageId = randomUUID();
    await prisma.proofImage.create({
      data: {
        id: proofImageId,
        athleteId: seeded.athleteId,
        clientSubmissionId,
        storagePath: `${seeded.athleteId}/${proofImageId}/expired.jpg`,
        verifiedSize: 100,
        verifiedMimeType: "image/jpeg",
        contentSha256: "e".repeat(64),
        uploadedAt: new Date(Date.now() - 60_000),
        deleteAfter: new Date(Date.now() - 1),
      },
    });
    await assert.rejects(
      () =>
        createEntry(seeded.athleteId, {
          ...seeded.input,
          clientSubmissionId,
          proofImageIds: [proofImageId],
        }),
      /proof images expired/,
    );
    assert.equal(await prisma.trainingEntry.count(), 0);
    await prisma.proofImage.update({
      where: { id: proofImageId },
      data: { deletedAt: new Date() },
    });
  });

  await t.test("double submission creates one durable entry and ignores browser OCR", async () => {
    const results = await Promise.all([
      createEntry(seeded.athleteId, seeded.input),
      createEntry(seeded.athleteId, seeded.input),
    ]);
    assert.equal(results[0].entry.id, results[1].entry.id);
    assert.equal(await prisma.trainingEntry.count(), 1);
    assert.equal(await prisma.evidenceExtractionJob.count(), 1);
    assert.equal(
      await prisma.auditLog.count({ where: { action: "CREATE" } }),
      1,
    );

    const entry = await prisma.trainingEntry.findFirstOrThrow();
    const proof = await prisma.proofImage.findUniqueOrThrow({
      where: { id: seeded.proofImageId },
    });
    assert.equal(entry.validationStatus, "PENDING");
    assert.equal(proof.trainingEntryId, entry.id);
    assert.ok(proof.attachedAt);
    assert.equal(
      proof.deleteAfter.toISOString(),
      getProofRetentionDeleteAfter(results[0].weekEndAt).toISOString(),
    );
  });

  await t.test("weekly aggregate rebuild completes through its database lock", async () => {
    const aggregate = await aggregateWeekForAthlete(
      seeded.teamId,
      seeded.athleteId,
      getWeekStartAt(seeded.input.date),
    );

    assert.equal(aggregate.athleteId, seeded.athleteId);
    assert.equal(aggregate.totalMinutes, 30);
    assert.equal(aggregate.totalDistance, 7.5);
  });

  await t.test("the same athlete cannot reuse attached proof bytes", async () => {
    const clientSubmissionId = randomUUID();
    const proofImageId = randomUUID();
    await prisma.proofImage.create({
      data: {
        id: proofImageId,
        athleteId: seeded.athleteId,
        clientSubmissionId,
        storagePath: `${seeded.athleteId}/${proofImageId}/replay.jpg`,
        verifiedSize: 100,
        verifiedMimeType: "image/jpeg",
        contentSha256: "a".repeat(64),
        uploadedAt: new Date(),
        deleteAfter: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await assert.rejects(
      () =>
        createEntry(seeded.athleteId, {
          ...seeded.input,
          clientSubmissionId,
          proofImageIds: [proofImageId],
        }),
      /already used for a workout/,
    );
    assert.equal(await prisma.trainingEntry.count(), 1);
  });

  await t.test("same submission id with different values conflicts", async () => {
    await assert.rejects(
      () =>
        createEntry(seeded.athleteId, {
          ...seeded.input,
          minutes: seeded.input.minutes + 1,
        }),
      /already saved with different values/,
    );
    assert.equal(await prisma.trainingEntry.count(), 1);
  });

  await t.test("stale athlete edits cannot overwrite each other", async () => {
    const entry = await prisma.trainingEntry.findFirstOrThrow();
    const outcomes = await Promise.allSettled([
      updateEntry(seeded.athleteId, {
        id: entry.id,
        expectedVersion: entry.version,
        notes: "First correction",
      }),
      updateEntry(seeded.athleteId, {
        id: entry.id,
        expectedVersion: entry.version,
        notes: "Second correction",
      }),
    ]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);
  });

  await t.test("two coaches cannot both decide the same version", async () => {
    const secondCoachId = randomUUID();
    const team = await prisma.team.findFirstOrThrow();
    await prisma.user.create({
      data: {
        id: secondCoachId,
        email: `${secondCoachId}@example.test`,
        role: "COACH",
        coachedTeams: { create: { teamId: team.id } },
      },
    });
    const entry = await prisma.trainingEntry.findFirstOrThrow();
    const outcomes = await Promise.allSettled([
      reviewValidationStatus(seeded.coachId, {
        entryId: entry.id,
        expectedVersion: entry.version,
        decision: "VERIFIED",
      }),
      reviewValidationStatus(secondCoachId, {
        entryId: entry.id,
        expectedVersion: entry.version,
        decision: "REJECTED",
        reason: "Values are not readable.",
      }),
    ]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((result) => result.status === "rejected").length, 1);

    const reviewed = await prisma.trainingEntry.findFirstOrThrow();
    assert.ok(reviewed.reviewedAt);
    assert.ok(reviewed.reviewedById);
    assert.ok(["VERIFIED", "REJECTED"].includes(reviewed.validationStatus));
    assert.equal(
      await prisma.auditLog.count({ where: { action: "REVIEW_VALIDATION" } }),
      1,
    );
  });

  await t.test("a worker result cannot overwrite a coach decision", async () => {
    const entryBefore = await prisma.trainingEntry.findFirstOrThrow();
    const job = await prisma.evidenceExtractionJob.findFirstOrThrow();
    const claimed = await claimNextEvidenceExtractionJob({ jobId: job.id });
    assert.ok(claimed);

    const result = await finalizeEvidenceExtractionJob({
      jobId: claimed.id,
      claimToken: claimed.claimToken,
      evidenceKey: claimed.evidenceKey,
      evidenceRevision: claimed.evidenceRevision,
      proofImageIds: claimed.proofImageIds,
      referenceDate: claimed.referenceDate,
      result: {
        activityType: "ERG",
        date: nowInZone().toISODate(),
        minutes: 30,
        durationSeconds: 1_800,
        elapsedSeconds: 1_800,
        distance: 7.5,
        avgHr: 145,
        confidence: 0.99,
        isSingleWorkout: true,
        reviewReason: null,
        sourceTypes: ["CONCEPT2"],
      },
      metadata: {
        provider: "test",
        model: "test-model",
        modelVersion: "1",
        promptVersion: "test",
        schemaVersion: "test",
        durationMs: 1,
        inputTokens: 1,
        outputTokens: 1,
      },
      evaluateEntry: () =>
        entryBefore.validationStatus === "VERIFIED" ? "PENDING" : "VERIFIED",
    });
    assert.equal(result.finalized, true);
    assert.equal(result.appliedToEntry, false);

    const entryAfter = await prisma.trainingEntry.findFirstOrThrow();
    assert.equal(entryAfter.validationStatus, entryBefore.validationStatus);
    assert.equal(entryAfter.version, entryBefore.version);
  });

  await t.test("a terminal extraction failure marks current evidence incomplete", async () => {
    const terminal = await seedSubmission();
    const created = await createEntry(terminal.athleteId, terminal.input);
    const job = await prisma.evidenceExtractionJob.findUniqueOrThrow({
      where: { entryId: created.entry.id },
    });
    const claimed = await claimNextEvidenceExtractionJob({ jobId: job.id });
    assert.ok(claimed);
    const entryBefore = await prisma.trainingEntry.findUniqueOrThrow({
      where: { id: created.entry.id },
    });

    const failure = await recordEvidenceExtractionFailure({
      jobId: claimed.id,
      claimToken: claimed.claimToken,
      attempts: claimed.attempts,
      retryable: false,
      failureCode: "invalid-response",
      message: "needs manual review",
    });
    assert.equal(failure.recorded, true);
    assert.equal(failure.willRetry, false);
    assert.equal(failure.appliedToEntry, true);

    const [entryAfter, proofAfter] = await Promise.all([
      prisma.trainingEntry.findUniqueOrThrow({ where: { id: created.entry.id } }),
      prisma.proofImage.findUniqueOrThrow({ where: { id: terminal.proofImageId } }),
    ]);
    assert.equal(entryAfter.validationStatus, "EXTRACTION_INCOMPLETE");
    assert.equal(entryAfter.version, entryBefore.version + 1);
    assert.equal(proofAfter.validationStatus, "EXTRACTION_INCOMPLETE");
    assert.equal(
      await prisma.auditLog.count({
        where: {
          entityId: created.entry.id,
          action: "AUTO_VALIDATE",
        },
      }),
      1,
    );
  });

  await t.test("a terminal extraction failure cannot overwrite a coach review", async () => {
    const reviewedSeed = await seedSubmission();
    const created = await createEntry(reviewedSeed.athleteId, reviewedSeed.input);
    const job = await prisma.evidenceExtractionJob.findUniqueOrThrow({
      where: { entryId: created.entry.id },
    });
    const claimed = await claimNextEvidenceExtractionJob({ jobId: job.id });
    assert.ok(claimed);
    const reviewed = await reviewValidationStatus(reviewedSeed.coachId, {
      entryId: created.entry.id,
      expectedVersion: created.entry.version,
      decision: "VERIFIED",
    });

    const failure = await recordEvidenceExtractionFailure({
      jobId: claimed.id,
      claimToken: claimed.claimToken,
      attempts: claimed.attempts,
      retryable: false,
      failureCode: "invalid-response",
      message: "needs manual review",
    });
    assert.equal(failure.recorded, true);
    assert.equal(failure.appliedToEntry, false);

    const entryAfter = await prisma.trainingEntry.findUniqueOrThrow({
      where: { id: created.entry.id },
    });
    assert.equal(entryAfter.validationStatus, "VERIFIED");
    assert.equal(entryAfter.version, reviewed.version);
    assert.equal(entryAfter.reviewedById, reviewedSeed.coachId);
    assert.equal(
      await prisma.auditLog.count({
        where: {
          entityId: created.entry.id,
          action: "AUTO_VALIDATE",
        },
      }),
      0,
    );
  });

  await t.test("an exhausted lease marks current evidence incomplete", async () => {
    const exhaustedSeed = await seedSubmission();
    const created = await createEntry(exhaustedSeed.athleteId, exhaustedSeed.input);
    const job = await prisma.evidenceExtractionJob.findUniqueOrThrow({
      where: { entryId: created.entry.id },
    });
    const exhaustionTime = new Date(Date.now() + 1_000);
    await prisma.evidenceExtractionJob.update({
      where: { id: job.id },
      data: {
        attempts: 3,
        status: "PENDING",
        nextAttemptAt: new Date(exhaustionTime.getTime() - 1),
      },
    });

    assert.equal(
      await claimNextEvidenceExtractionJob({
        jobId: job.id,
        now: exhaustionTime,
      }),
      null,
    );
    const [failedJob, entryAfter] = await Promise.all([
      prisma.evidenceExtractionJob.findUniqueOrThrow({ where: { id: job.id } }),
      prisma.trainingEntry.findUniqueOrThrow({ where: { id: created.entry.id } }),
    ]);
    assert.equal(failedJob.status, "FAILED");
    assert.equal(failedJob.failureCode, "attempts-exhausted");
    assert.equal(entryAfter.validationStatus, "EXTRACTION_INCOMPLETE");
    assert.equal(
      await prisma.auditLog.count({
        where: {
          entityId: created.entry.id,
          action: "AUTO_VALIDATE",
        },
      }),
      1,
    );
  });

  await t.test("concurrent workers claim jobs once and expired leases recover", async () => {
    const jobs = Array.from({ length: 10 }, () => ({
      id: randomUUID(),
      athleteId: seeded.athleteId,
      clientSubmissionId: randomUUID(),
      evidenceRevision: 1,
      evidenceKey: randomUUID(),
      proofImageIds: [] as string[],
      referenceDate: new Date(),
    }));
    await prisma.evidenceExtractionJob.createMany({ data: jobs });
    const claimTime = new Date(Date.now() + 1_000);
    const claims = (
      await Promise.all(
        Array.from({ length: 15 }, () =>
          claimNextEvidenceExtractionJob({ now: claimTime }),
        ),
      )
    ).filter((claim): claim is NonNullable<typeof claim> => claim !== null);
    assert.equal(claims.length, 10);
    assert.equal(new Set(claims.map((claim) => claim.id)).size, 10);

    const originalClaim = claims[0];
    assert.ok(originalClaim);
    assert.equal(
      await claimNextEvidenceExtractionJob({
        now: claimTime,
        jobId: originalClaim.id,
      }),
      null,
    );

    const recoveryTime = new Date(claimTime.getTime() + 5 * 60_000);
    await prisma.evidenceExtractionJob.update({
      where: { id: originalClaim.id },
      data: {
        leaseExpiresAt: new Date(recoveryTime.getTime() - 1),
        nextAttemptAt: new Date(recoveryTime.getTime() - 1),
      },
    });
    const reclaimed = await claimNextEvidenceExtractionJob({
      now: recoveryTime,
      jobId: originalClaim.id,
    });
    assert.ok(reclaimed);
    assert.equal(reclaimed.attempts, 2);
    assert.notEqual(reclaimed.claimToken, originalClaim.claimToken);

    const stale = await recordEvidenceExtractionFailure({
      jobId: originalClaim.id,
      claimToken: originalClaim.claimToken,
      attempts: originalClaim.attempts,
      retryable: true,
      failureCode: "timeout",
      message: "retry",
      now: recoveryTime,
    });
    assert.equal(stale.recorded, false);

    const current = await recordEvidenceExtractionFailure({
      jobId: reclaimed.id,
      claimToken: reclaimed.claimToken,
      attempts: reclaimed.attempts,
      retryable: true,
      failureCode: "timeout",
      message: "retry",
      now: recoveryTime,
    });
    assert.equal(current.recorded, true);
    assert.equal(current.willRetry, true);
  });

  await t.test("the replay constraint serializes concurrent attachments", async () => {
    const replaySeed = await seedSubmission();
    const firstSubmissionId = randomUUID();
    const secondSubmissionId = randomUUID();
    const firstProofId = randomUUID();
    const secondProofId = randomUUID();
    const sharedHash = "b".repeat(64);
    await prisma.proofImage.createMany({
      data: [
        {
          id: firstProofId,
          athleteId: replaySeed.athleteId,
          clientSubmissionId: firstSubmissionId,
          storagePath: `${replaySeed.athleteId}/${firstProofId}/first.jpg`,
          verifiedSize: 100,
          verifiedMimeType: "image/jpeg",
          contentSha256: sharedHash,
          uploadedAt: new Date(),
          deleteAfter: new Date(Date.now() + 60 * 60 * 1000),
        },
        {
          id: secondProofId,
          athleteId: replaySeed.athleteId,
          clientSubmissionId: secondSubmissionId,
          storagePath: `${replaySeed.athleteId}/${secondProofId}/second.jpg`,
          verifiedSize: 100,
          verifiedMimeType: "image/jpeg",
          contentSha256: sharedHash,
          uploadedAt: new Date(),
          deleteAfter: new Date(Date.now() + 60 * 60 * 1000),
        },
      ],
    });

    const outcomes = await Promise.allSettled([
      createEntry(replaySeed.athleteId, {
        ...replaySeed.input,
        clientSubmissionId: firstSubmissionId,
        proofImageIds: [firstProofId],
      }),
      createEntry(replaySeed.athleteId, {
        ...replaySeed.input,
        clientSubmissionId: secondSubmissionId,
        proofImageIds: [secondProofId],
      }),
    ]);
    assert.equal(outcomes.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = outcomes.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    assert.match(String(rejected?.reason), /already used for a workout/);
  });

  await t.test("leaderboards stay canonical when background reconciliation never runs", async () => {
    const mutationSeed = await seedSubmission();
    const teamId = (
      await prisma.athleteProfile.findUniqueOrThrow({
        where: { userId: mutationSeed.athleteId },
        select: { teamId: true },
      })
    ).teamId;
    const created = await createEntry(mutationSeed.athleteId, mutationSeed.input);
    const weekStartAt = created.entry.weekStartAt;

    await prisma.weeklyRequirement.create({
      data: {
        teamId,
        weekStartAt,
        weekEndAt: getWeekEndAt(weekStartAt),
        requiredMinutes: 40,
      },
    });

    await prisma.weeklyAggregate.create({
      data: {
        athleteId: mutationSeed.athleteId,
        teamId,
        weekStartAt,
        weekEndAt: getWeekEndAt(weekStartAt),
        totalMinutes: 999,
        totalDistance: 999,
        activityTypes: ["RUN"],
        hasHrData: false,
        status: "NOT_MET",
      },
    });

    const afterCreate = (await getTeamLeaderboard(teamId, weekStartAt)).find(
      (row) => row.athleteId === mutationSeed.athleteId,
    );
    assert.ok(afterCreate);
    assert.equal(afterCreate.totalMinutes, 30);
    assert.equal(afterCreate.totalDistance, 7.5);
    assert.deepEqual(afterCreate.activityTypes, ["ERG"]);
    assert.equal(afterCreate.pendingProof, true);

    const dashboard = await getAthleteDashboard(
      mutationSeed.athleteId,
      weekStartAt,
    );
    assert.equal(dashboard.totalMinutes, 30);
    assert.equal(dashboard.requiredMinutes, 40);
    assert.equal(dashboard.status, "NOT_MET");

    const canonicalHistory = await getAthleteHistory(mutationSeed.athleteId);
    assert.equal(canonicalHistory.length, 32);
    const canonicalHistoryWeek = canonicalHistory.find(
      (week) => week.weekStartAt.getTime() === weekStartAt.getTime(),
    );
    assert.ok(canonicalHistoryWeek);
    assert.equal(canonicalHistoryWeek.totalMinutes, 30);
    assert.equal(canonicalHistoryWeek.totalDistance, 7.5);
    assert.equal(canonicalHistoryWeek.requiredMinutes, 40);
    assert.equal(canonicalHistoryWeek.status, "NOT_MET");

    const detailedHistory = await getAthleteHistoryWithEntries(
      mutationSeed.athleteId,
    );
    assert.equal(detailedHistory.length, 1);
    assert.equal(detailedHistory[0]?.totalMinutes, 30);
    assert.equal(detailedHistory[0]?.requiredMinutes, 40);

    const coachDetail = await getAthleteDetail(
      mutationSeed.coachId,
      mutationSeed.athleteId,
      teamId,
    );
    assert.equal(coachDetail.history.length, 52);
    assert.equal(coachDetail.history[0]?.totalMinutes, 30);
    assert.equal(coachDetail.history[0]?.requiredMinutes, 40);
    assert.equal(coachDetail.history[0]?.status, "NOT_MET");

    const currentTrend = (await getTeamTrends(teamId, 12)).find(
      (week) => week.weekStartAt.getTime() === weekStartAt.getTime(),
    );
    assert.ok(currentTrend);
    assert.equal(currentTrend.totalMinutes, 30);
    assert.equal(currentTrend.athleteCount, 1);

    const currentCsv = await exportWeeklyCsv(teamId, weekStartAt);
    assert.match(currentCsv, /"30","NOT_MET"/);
    assert.doesNotMatch(currentCsv, /"999"/);

    const updated = await updateEntry(mutationSeed.athleteId, {
      id: created.entry.id,
      expectedVersion: created.entry.version,
      minutes: 45,
      distance: 10,
    });
    const afterEdit = (await getTeamLeaderboard(teamId, weekStartAt)).find(
      (row) => row.athleteId === mutationSeed.athleteId,
    );
    assert.ok(afterEdit);
    assert.equal(afterEdit.totalMinutes, 45);
    assert.equal(afterEdit.totalDistance, 10);
    const historyAfterEdit = await getAthleteHistory(mutationSeed.athleteId);
    assert.equal(historyAfterEdit[0]?.totalMinutes, 45);
    assert.equal(historyAfterEdit[0]?.status, "MET");

    await deleteEntry(mutationSeed.athleteId, updated.entry.id);
    const afterDelete = (await getTeamLeaderboard(teamId, weekStartAt)).find(
      (row) => row.athleteId === mutationSeed.athleteId,
    );
    assert.ok(afterDelete);
    assert.equal(afterDelete.totalMinutes, 0);
    assert.equal(afterDelete.totalDistance, 0);
    assert.deepEqual(afterDelete.activityTypes, []);

    const historyAfterDelete = await getAthleteHistory(mutationSeed.athleteId);
    assert.equal(historyAfterDelete[0]?.totalMinutes, 0);
    assert.equal(historyAfterDelete[0]?.status, "NOT_MET");
    assert.deepEqual(
      await getAthleteHistoryWithEntries(mutationSeed.athleteId),
      [],
    );
    const detailAfterDelete = await getAthleteDetail(
      mutationSeed.coachId,
      mutationSeed.athleteId,
      teamId,
    );
    assert.equal(detailAfterDelete.history[0]?.totalMinutes, 0);
    assert.equal(detailAfterDelete.history[0]?.status, "NOT_MET");
    assert.match(await exportWeeklyCsv(teamId, weekStartAt), /"0","NOT_MET"/);

    await prisma.exemption.create({
      data: {
        athleteId: mutationSeed.athleteId,
        weekStartAt,
        reason: "Medical exemption",
        createdBy: mutationSeed.coachId,
      },
    });
    const exemptHistory = await getAthleteHistory(mutationSeed.athleteId);
    assert.equal(exemptHistory[0]?.status, "EXEMPT");
    assert.equal(exemptHistory[0]?.requiredMinutes, 0);
    assert.match(await exportWeeklyCsv(teamId, weekStartAt), /"0","EXEMPT"/);

    let outsideAthleteHistory = weekStartAt;
    for (let index = 0; index < 32; index += 1) {
      outsideAthleteHistory = getPreviousWeekStartAt(outsideAthleteHistory);
    }
    await prisma.trainingEntry.create({
      data: {
        athleteId: mutationSeed.athleteId,
        activityType: "RUN",
        date: new Date(outsideAthleteHistory.getTime() + 12 * 60 * 60 * 1_000),
        minutes: 999,
        distance: 999,
        validationStatus: "VERIFIED",
        weekStartAt: outsideAthleteHistory,
      },
    });
    assert.deepEqual(
      await getAthleteHistoryWithEntries(mutationSeed.athleteId),
      [],
    );
    assert.equal(
      (await getAthleteHistory(mutationSeed.athleteId)).some(
        (week) => week.weekStartAt.getTime() === outsideAthleteHistory.getTime(),
      ),
      false,
    );

    const reviewSeed = await seedSubmission();
    const reviewTeamId = (
      await prisma.athleteProfile.findUniqueOrThrow({
        where: { userId: reviewSeed.athleteId },
        select: { teamId: true },
      })
    ).teamId;
    const reviewCreated = await createEntry(reviewSeed.athleteId, reviewSeed.input);
    await prisma.weeklyAggregate.create({
      data: {
        athleteId: reviewSeed.athleteId,
        teamId: reviewTeamId,
        weekStartAt: reviewCreated.entry.weekStartAt,
        weekEndAt: getWeekEndAt(reviewCreated.entry.weekStartAt),
        totalMinutes: 999,
        totalDistance: 999,
        activityTypes: ["RUN"],
        hasHrData: true,
        status: "MET",
      },
    });
    await reviewValidationStatus(reviewSeed.coachId, {
      entryId: reviewCreated.entry.id,
      expectedVersion: reviewCreated.entry.version,
      decision: "REJECTED",
      reason: "Values are not readable.",
    });

    const afterReview = (
      await getTeamLeaderboard(reviewTeamId, reviewCreated.entry.weekStartAt)
    ).find((row) => row.athleteId === reviewSeed.athleteId);
    assert.ok(afterReview);
    assert.equal(afterReview.totalMinutes, 0);
    assert.equal(afterReview.totalDistance, 0);
    assert.equal(afterReview.missingProof, true);
    assert.equal(afterReview.pendingProof, false);

    const staleCaches = await prisma.weeklyAggregate.findMany({
      where: {
        athleteId: { in: [mutationSeed.athleteId, reviewSeed.athleteId] },
      },
      orderBy: { athleteId: "asc" },
      select: { totalMinutes: true },
    });
    assert.deepEqual(staleCaches.map((row) => row.totalMinutes), [999, 999]);
  });

  await t.test("cleanup rechecks a stale candidate before removing storage", async () => {
    const proofImageId = randomUUID();
    const now = new Date();
    await prisma.proofImage.create({
      data: {
        id: proofImageId,
        athleteId: seeded.athleteId,
        storagePath: `${seeded.athleteId}/${proofImageId}/stale.jpg`,
        deleteAfter: new Date(now.getTime() - 60_000),
      },
    });
    const candidates = await listExpiredProofImages(now, 500);
    assert.ok(candidates.some((candidate) => candidate.id === proofImageId));
    await prisma.proofImage.update({
      where: { id: proofImageId },
      data: { deleteAfter: new Date(now.getTime() + 60_000) },
    });

    let removalCalls = 0;
    assert.equal(
      await cleanupExpiredProofImageCandidate(proofImageId, now, async () => {
        removalCalls += 1;
      }),
      false,
    );
    assert.equal(removalCalls, 0);
    assert.equal(
      (await prisma.proofImage.findUniqueOrThrow({ where: { id: proofImageId } }))
        .deletedAt,
      null,
    );
  });

  await t.test("cleanup is bounded, continues after failure, and retries safely", async () => {
    const now = new Date();
    const proofIds = [randomUUID(), randomUUID(), randomUUID()];
    const storagePaths = ["fail.jpg", "success.jpg", "deferred.jpg"].map(
      (name, index) => `${seeded.athleteId}/${proofIds[index]}/${name}`,
    );
    await prisma.proofImage.createMany({
      data: proofIds.map((id, index) => ({
        id,
        athleteId: seeded.athleteId,
        storagePath: storagePaths[index] as string,
        deleteAfter: new Date(now.getTime() - (3 - index) * 60_000),
      })),
    });

    const first = await cleanupExpiredProofImages({
      now,
      maxCandidates: 2,
      removeStorageObject: async (storagePath) => {
        if (storagePath === storagePaths[0]) throw new Error("storage unavailable");
      },
    });
    assert.deepEqual(first, { deletedCount: 1, failedCount: 1 });
    const afterFirst = await prisma.proofImage.findMany({
      where: { id: { in: proofIds } },
      orderBy: { deleteAfter: "asc" },
    });
    assert.equal(afterFirst[0]?.deletedAt, null);
    assert.ok(afterFirst[1]?.deletedAt);
    assert.equal(afterFirst[2]?.deletedAt, null);

    const removedOnRetry: string[] = [];
    const second = await cleanupExpiredProofImages({
      now,
      removeStorageObject: async (storagePath) => {
        removedOnRetry.push(storagePath);
      },
    });
    assert.deepEqual(second, { deletedCount: 2, failedCount: 0 });
    assert.deepEqual(removedOnRetry.sort(), [storagePaths[0], storagePaths[2]].sort());
    assert.equal(
      await prisma.proofImage.count({
        where: { id: { in: proofIds }, deletedAt: null },
      }),
      0,
    );
  });

  await t.test("delivery-only recap dispatch neither enqueues nor rebuilds", async () => {
    await prisma.weeklyRecapDelivery.deleteMany();
    const cutoff = new Date("2026-03-09T00:00:00.000Z");
    const seededRecap = await seedWeeklyRecap({
      now: cutoff,
      createDelivery: false,
    });
    const aggregateBefore = await prisma.weeklyAggregate.findMany({
      where: { teamId: seededRecap.teamId },
      orderBy: { weekStartAt: "asc" },
      select: { id: true, updatedAt: true },
    });
    let sendCount = 0;

    const result = await runWeeklyRecapDelivery({
      now: cutoff,
      sendEmailFn: async () => {
        sendCount += 1;
        return { provider: "resend", messageId: "unexpected" };
      },
    });

    assert.equal(result.delivery.status, "completed");
    assert.equal(result.delivery.claimed, 0);
    assert.equal(sendCount, 0);
    assert.equal(await prisma.weeklyRecapDelivery.count(), 0);
    assert.deepEqual(
      await prisma.weeklyAggregate.findMany({
        where: { teamId: seededRecap.teamId },
        orderBy: { weekStartAt: "asc" },
        select: { id: true, updatedAt: true },
      }),
      aggregateBefore,
    );
  });

  await t.test("aggregate repair failure cannot suppress a due recap", async () => {
    await prisma.weeklyRecapDelivery.deleteMany();
    await prisma.team.updateMany({ data: { weeklyRecapEnabled: false } });
    const cutoff = new Date("2026-03-09T00:00:00.000Z");
    const seededRecap = await seedWeeklyRecap({
      now: cutoff,
      createDelivery: false,
    });
    const aggregateBefore = await prisma.weeklyAggregate.findMany({
      where: { teamId: seededRecap.teamId },
      orderBy: { weekStartAt: "asc" },
      select: { id: true, updatedAt: true },
    });
    const executionOrder: string[] = [];

    const result = await runWeeklyAggregation({
      now: cutoff,
      sendEmailFn: async () => {
        executionOrder.push("email-sent");
        return { provider: "resend", messageId: "repair-failure-message" };
      },
      rebuildWeeklyAggregatesFn: async () => {
        executionOrder.push("aggregate-repair-started");
        throw new Error("injected aggregate repair failure");
      },
    });

    assert.deepEqual(executionOrder, [
      "email-sent",
      "aggregate-repair-started",
    ]);
    assert.equal(result.aggregation, null);
    assert.deepEqual(result.aggregationError, {
      code: "WEEKLY_AGGREGATION_REPAIR_FAILED",
    });
    assert.equal(result.enqueue.status, "completed");
    assert.equal(result.enqueue.createdCount, 1);
    assert.equal(result.delivery.status, "completed");
    assert.equal(result.emailSummary.sent, 1);
    assert.equal(result.needsAttention, true);

    const delivery = await prisma.weeklyRecapDelivery.findFirstOrThrow({
      where: {
        teamId: seededRecap.teamId,
        weekStartAt: seededRecap.recapWeekStartAt,
        userId: seededRecap.athleteId,
      },
    });
    assert.equal(delivery.status, "SENT");
    assert.equal(delivery.attemptCount, 1);
    assert.equal(delivery.providerMessageId, "repair-failure-message");
    assert.deepEqual(
      await prisma.weeklyAggregate.findMany({
        where: { teamId: seededRecap.teamId },
        orderBy: { weekStartAt: "asc" },
        select: { id: true, updatedAt: true },
      }),
      aggregateBefore,
    );
  });

  await t.test("delivery-only recap retries at the persisted clock boundaries", async () => {
    await prisma.weeklyRecapDelivery.deleteMany();
    const cutoff = new Date("2026-03-09T00:00:00.000Z");
    const seededRecap = await seedWeeklyRecap({
      now: cutoff,
      createDelivery: true,
    });
    assert.ok(seededRecap.delivery);
    const aggregateBefore = await prisma.weeklyAggregate.findMany({
      where: { teamId: seededRecap.teamId },
      orderBy: { weekStartAt: "asc" },
      select: { id: true, updatedAt: true },
    });
    const idempotencyKeys: Array<string | undefined> = [];
    let sendCount = 0;
    const sendEmailFn = async (payload: { idempotencyKey?: string }) => {
      sendCount += 1;
      idempotencyKeys.push(payload.idempotencyKey);
      if (sendCount < 3) {
        throw new EmailDeliveryError("temporary test failure", {
          code: "EMAIL_PROVIDER_TEMPORARY",
          transient: true,
          ambiguous: false,
        });
      }
      return { provider: "resend" as const, messageId: "test-message-id" };
    };

    const first = await runWeeklyRecapDelivery({
      now: cutoff,
      sendEmailFn,
    });
    assert.equal(first.emailSummary.retryScheduled, 1);
    let delivery = await prisma.weeklyRecapDelivery.findUniqueOrThrow({
      where: { id: seededRecap.delivery.id },
    });
    assert.equal(delivery.status, "FAILED");
    assert.equal(delivery.attemptCount, 1);
    assert.equal(
      delivery.nextAttemptAt.toISOString(),
      "2026-03-09T00:05:00.000Z",
    );

    const beforeFirstRetry = await runWeeklyRecapDelivery({
      now: new Date("2026-03-09T00:04:59.999Z"),
      sendEmailFn,
    });
    assert.equal(beforeFirstRetry.delivery.status, "completed");
    assert.equal(beforeFirstRetry.delivery.claimed, 0);
    assert.equal(sendCount, 1);

    const second = await runWeeklyRecapDelivery({
      now: new Date("2026-03-09T00:05:00.000Z"),
      sendEmailFn,
    });
    assert.equal(second.emailSummary.retryScheduled, 1);
    delivery = await prisma.weeklyRecapDelivery.findUniqueOrThrow({
      where: { id: seededRecap.delivery.id },
    });
    assert.equal(delivery.status, "FAILED");
    assert.equal(delivery.attemptCount, 2);
    assert.equal(
      delivery.nextAttemptAt.toISOString(),
      "2026-03-09T00:35:00.000Z",
    );

    const beforeSecondRetry = await runWeeklyRecapDelivery({
      now: new Date("2026-03-09T00:34:59.999Z"),
      sendEmailFn,
    });
    assert.equal(beforeSecondRetry.delivery.status, "completed");
    assert.equal(beforeSecondRetry.delivery.claimed, 0);
    assert.equal(sendCount, 2);

    const third = await runWeeklyRecapDelivery({
      now: new Date("2026-03-09T00:35:00.000Z"),
      sendEmailFn,
    });
    assert.equal(third.emailSummary.sent, 1);
    delivery = await prisma.weeklyRecapDelivery.findUniqueOrThrow({
      where: { id: seededRecap.delivery.id },
    });
    assert.equal(delivery.status, "SENT");
    assert.equal(delivery.attemptCount, 3);
    assert.equal(delivery.sentAt?.toISOString(), "2026-03-09T00:35:00.000Z");
    assert.deepEqual(idempotencyKeys, [
      idempotencyKeys[0],
      idempotencyKeys[0],
      idempotencyKeys[0],
    ]);
    assert.ok(idempotencyKeys[0]?.startsWith("weekly-recap:"));
    assert.deepEqual(
      await prisma.weeklyAggregate.findMany({
        where: { teamId: seededRecap.teamId },
        orderBy: { weekStartAt: "asc" },
        select: { id: true, updatedAt: true },
      }),
      aggregateBefore,
    );
  });

  await t.test("delivery-only recap closes at the exact 48-hour boundary", async () => {
    await prisma.weeklyRecapDelivery.deleteMany();
    const cutoff = new Date("2026-11-02T01:00:00.000Z");
    const windowEnd = new Date("2026-11-04T01:00:00.000Z");
    const seededRecap = await seedWeeklyRecap({
      now: cutoff,
      createDelivery: true,
      status: "FAILED",
      attemptCount: 1,
      nextAttemptAt: windowEnd,
    });
    assert.ok(seededRecap.delivery);
    let sendCount = 0;

    const result = await runWeeklyRecapDelivery({
      now: windowEnd,
      sendEmailFn: async () => {
        sendCount += 1;
        return { provider: "resend", messageId: "unexpected" };
      },
    });

    assert.equal(result.delivery.status, "skipped");
    assert.equal(result.delivery.reason, "outside-email-window");
    assert.equal(sendCount, 0);
    const delivery = await prisma.weeklyRecapDelivery.findUniqueOrThrow({
      where: { id: seededRecap.delivery.id },
    });
    assert.equal(delivery.status, "FAILED");
    assert.equal(delivery.attemptCount, 1);
  });

  await t.test("coach and athlete callers cannot cross team boundaries", async () => {
    const teamA = await seedSubmission();
    const teamB = await seedSubmission();
    const [profileA, profileB] = await Promise.all([
      prisma.athleteProfile.findUniqueOrThrow({
        where: { userId: teamA.athleteId },
        select: { teamId: true },
      }),
      prisma.athleteProfile.findUniqueOrThrow({
        where: { userId: teamB.athleteId },
        select: { teamId: true },
      }),
    ]);
    const weekStartAt = getWeekStartAt(new Date());
    const weekEndAt = getWeekEndAt(weekStartAt);
    const foreignEntry = await prisma.trainingEntry.create({
      data: {
        athleteId: teamB.athleteId,
        clientSubmissionId: randomUUID(),
        activityType: "ERG",
        date: new Date(),
        minutes: 40,
        distance: 10,
        validationStatus: "EXTRACTION_INCOMPLETE",
        entryStatus: "ACTIVE",
        weekStartAt,
      },
    });
    await prisma.weeklyRequirement.create({
      data: {
        teamId: profileB.teamId,
        weekStartAt,
        weekEndAt,
        requiredMinutes: 180,
      },
    });
    const foreignExemption = await prisma.exemption.create({
      data: {
        athleteId: teamB.athleteId,
        weekStartAt,
        reason: "Foreign private setting",
        isIndefinite: false,
        createdBy: teamB.coachId,
      },
    });
    const foreignOverride = await prisma.athleteWeeklyRequirementOverride.create({
      data: {
        athleteId: teamB.athleteId,
        weekStartAt,
        requiredMinutes: 120,
        reason: "Foreign private override",
        createdBy: teamB.coachId,
      },
    });

    const coachA = createAuthenticatedCaller({
      id: teamA.coachId,
      email: `${teamA.coachId}@example.test`,
      name: null,
      role: "COACH",
      status: "ACTIVE",
    });
    const coachB = createAuthenticatedCaller({
      id: teamB.coachId,
      email: `${teamB.coachId}@example.test`,
      name: null,
      role: "COACH",
      status: "ACTIVE",
    });
    const athleteA = createAuthenticatedCaller({
      id: teamA.athleteId,
      email: `${teamA.athleteId}@example.test`,
      name: null,
      role: "ATHLETE",
      status: "ACTIVE",
    });

    const ownAthletes = await coachA.coach.listAthletes({
      teamId: profileA.teamId,
    });
    assert.deepEqual(ownAthletes.map((athlete) => athlete.id), [teamA.athleteId]);
    const ownDetail = await coachA.coach.getAthleteDetail({
      teamId: profileA.teamId,
      athleteId: teamA.athleteId,
    });
    assert.equal(ownDetail.athlete.id, teamA.athleteId);
    await assertAccessDenied(() =>
      coachA.coach.listAthletes({ teamId: profileB.teamId }),
    );
    await assertAccessDenied(() =>
      coachA.coach.getAthleteDetail({
        teamId: profileB.teamId,
        athleteId: teamB.athleteId,
      }),
    );

    const ownReviewQueue = await coachB.coach.getReviewQueue({
      teamId: profileB.teamId,
      weekStartAt,
      state: "NEEDS_REVIEW",
      limit: 20,
    });
    assert.ok(ownReviewQueue.entries.some((entry) => entry.id === foreignEntry.id));
    const ownEvidence = await coachB.coach.getReviewEvidence({
      entryId: foreignEntry.id,
      expectedVersion: foreignEntry.version,
    });
    assert.deepEqual(ownEvidence.images, []);
    await assertAccessDenied(() =>
      coachA.coach.getReviewQueue({
        teamId: profileB.teamId,
        weekStartAt,
        state: "NEEDS_REVIEW",
        limit: 20,
      }),
    );
    await assertAccessDenied(() =>
      coachA.coach.getReviewEvidence({
        entryId: foreignEntry.id,
        expectedVersion: foreignEntry.version,
      }),
    );
    await assertAccessDenied(() =>
      coachA.coach.overrideValidationStatus({
        entryId: foreignEntry.id,
        expectedVersion: foreignEntry.version,
        decision: "VERIFIED",
      }),
    );
    assert.equal(
      (
        await prisma.trainingEntry.findUniqueOrThrow({
          where: { id: foreignEntry.id },
        })
      ).validationStatus,
      "EXTRACTION_INCOMPLETE",
    );

    const ownSettings = await coachB.coach.getWeeklySettings({
      teamId: profileB.teamId,
      weekStartAt,
    });
    assert.equal(ownSettings.requiredMinutes, 180);
    assert.ok(
      ownSettings.athletes.some((athlete) => athlete.id === teamB.athleteId),
    );
    await assertAccessDenied(() =>
      coachA.coach.getWeeklySettings({
        teamId: profileB.teamId,
        weekStartAt,
      }),
    );
    await assertAccessDenied(() =>
      coachA.coach.getWeeklyRequirementsRange({
        teamId: profileB.teamId,
        startAt: weekStartAt,
        endAt: weekEndAt,
      }),
    );
    await assertAccessDenied(() =>
      coachA.coach.setWeeklyRequirement({
        teamId: profileB.teamId,
        weekStartAt,
        requiredMinutes: 999,
      }),
    );
    await assertAccessDenied(() =>
      coachA.coach.saveAthleteWeeklySetting({
        teamId: profileB.teamId,
        athleteId: teamB.athleteId,
        weekStartAt,
        mode: "NONE",
        requiredMinutes: 999,
        reason: "Unauthorized mutation",
      }),
    );
    await assertAccessDenied(() =>
      coachA.coach.removeExemption({ exemptionId: foreignExemption.id }),
    );
    await assertAccessDenied(() =>
      coachA.coach.removeAthleteWeeklyRequirementOverride({
        overrideId: foreignOverride.id,
      }),
    );
    assert.equal(
      (
        await prisma.weeklyRequirement.findUniqueOrThrow({
          where: {
            teamId_weekStartAt: {
              teamId: profileB.teamId,
              weekStartAt,
            },
          },
        })
      ).requiredMinutes,
      180,
    );
    assert.ok(
      await prisma.exemption.findUnique({ where: { id: foreignExemption.id } }),
    );
    assert.ok(
      await prisma.athleteWeeklyRequirementOverride.findUnique({
        where: { id: foreignOverride.id },
      }),
    );

    const ownTrends = await coachB.reporting.getTeamTrends({
      teamId: profileB.teamId,
      limit: 2,
    });
    assert.ok(ownTrends.some((week) => week.totalMinutes === 40));
    const ownCsv = await coachB.reporting.exportCsv({
      teamId: profileB.teamId,
      weekStartAt,
    });
    assert.match(ownCsv, /"40"/);
    await assertAccessDenied(() =>
      coachA.reporting.getTeamTrends({
        teamId: profileB.teamId,
        limit: 2,
      }),
    );
    await assertAccessDenied(() =>
      coachA.reporting.exportCsv({
        teamId: profileB.teamId,
        weekStartAt,
      }),
    );

    await assertAccessDenied(() =>
      coachA.proof.getSignedViewUrl({ proofImageId: teamB.proofImageId }),
    );
    await assertAccessDenied(() =>
      athleteA.proof.getSignedViewUrl({ proofImageId: teamB.proofImageId }),
    );
  });
});
