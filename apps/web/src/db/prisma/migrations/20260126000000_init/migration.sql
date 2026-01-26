-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ATHLETE', 'COACH', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('ERG', 'RUN', 'CYCLE', 'SWIM', 'OTHER');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('NOT_CHECKED', 'PENDING', 'VERIFIED', 'REJECTED', 'EXTRACTION_INCOMPLETE');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "WeeklyStatus" AS ENUM ('MET', 'NOT_MET', 'EXEMPT');

-- CreateEnum
CREATE TYPE "ProofExtractionStatus" AS ENUM ('NOT_CHECKED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyRequirement" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "weekStartAt" TIMESTAMP(3) NOT NULL,
    "weekEndAt" TIMESTAMP(3) NOT NULL,
    "requiredMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exemption" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "weekStartAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofImage" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "deleteAfter" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "extractedFields" JSONB,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingEntry" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "avgHr" INTEGER,
    "notes" TEXT,
    "proofImageId" TEXT NOT NULL,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "entryStatus" "EntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "weekStartAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAggregate" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "weekStartAt" TIMESTAMP(3) NOT NULL,
    "weekEndAt" TIMESTAMP(3) NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "activityTypes" "ActivityType"[],
    "hasHrData" BOOLEAN NOT NULL,
    "status" "WeeklyStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofExtractionJob" (
    "id" TEXT NOT NULL,
    "proofImageId" TEXT NOT NULL,
    "status" "ProofExtractionStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProofExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");

-- CreateIndex
CREATE INDEX "AthleteProfile_teamId_idx" ON "AthleteProfile"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyRequirement_teamId_weekStartAt_key" ON "WeeklyRequirement"("teamId", "weekStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "Exemption_athleteId_weekStartAt_key" ON "Exemption"("athleteId", "weekStartAt");

-- CreateIndex
CREATE INDEX "ProofImage_athleteId_deleteAfter_idx" ON "ProofImage"("athleteId", "deleteAfter");

-- CreateIndex
CREATE INDEX "TrainingEntry_athleteId_weekStartAt_idx" ON "TrainingEntry"("athleteId", "weekStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyAggregate_athleteId_weekStartAt_key" ON "WeeklyAggregate"("athleteId", "weekStartAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ProofExtractionJob_proofImageId_key" ON "ProofExtractionJob"("proofImageId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyRequirement" ADD CONSTRAINT "WeeklyRequirement_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemption" ADD CONSTRAINT "Exemption_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exemption" ADD CONSTRAINT "Exemption_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofImage" ADD CONSTRAINT "ProofImage_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofImage" ADD CONSTRAINT "ProofImage_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEntry" ADD CONSTRAINT "TrainingEntry_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEntry" ADD CONSTRAINT "TrainingEntry_proofImageId_fkey" FOREIGN KEY ("proofImageId") REFERENCES "ProofImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAggregate" ADD CONSTRAINT "WeeklyAggregate_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAggregate" ADD CONSTRAINT "WeeklyAggregate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofExtractionJob" ADD CONSTRAINT "ProofExtractionJob_proofImageId_fkey" FOREIGN KEY ("proofImageId") REFERENCES "ProofImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
