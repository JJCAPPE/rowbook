-- CreateEnum
CREATE TYPE "ActivityProvider" AS ENUM ('GARMIN', 'STRAVA', 'POLAR');

-- CreateEnum
CREATE TYPE "ConnectedAccountStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "ExternalActivityStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'IGNORED', 'DUPLICATE', 'OUT_OF_WINDOW');

-- CreateEnum
CREATE TYPE "EntryOrigin" AS ENUM ('MANUAL_PROOF', 'CONNECTED_PROVIDER');

-- AlterTable
ALTER TABLE "TrainingEntry"
ADD COLUMN "origin" "EntryOrigin" NOT NULL DEFAULT 'MANUAL_PROOF',
ADD COLUMN "originProvider" "ActivityProvider",
ADD COLUMN "originExternalActivityId" TEXT;

-- CreateTable
CREATE TABLE "ConnectedAccount" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "provider" "ActivityProvider" NOT NULL,
  "providerUserId" TEXT NOT NULL,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "status" "ConnectedAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastSyncAt" TIMESTAMP(3),
  "lastSyncCursor" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalActivity" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "connectedAccountId" TEXT NOT NULL,
  "provider" "ActivityProvider" NOT NULL,
  "providerActivityId" TEXT NOT NULL,
  "activityType" "ActivityType",
  "trainingDate" TIMESTAMP(3),
  "minutes" INTEGER,
  "distanceKm" DOUBLE PRECISION,
  "avgHr" INTEGER,
  "providerFieldMask" JSONB,
  "missingRequiredFields" JSONB,
  "status" "ExternalActivityStatus" NOT NULL DEFAULT 'SUGGESTED',
  "sourceFormat" TEXT,
  "sourceChecksum" TEXT,
  "trainingEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingEntry_originExternalActivityId_key" ON "TrainingEntry"("originExternalActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_athleteId_provider_key" ON "ConnectedAccount"("athleteId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_provider_providerUserId_key" ON "ConnectedAccount"("provider", "providerUserId");

-- CreateIndex
CREATE INDEX "ConnectedAccount_provider_status_idx" ON "ConnectedAccount"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalActivity_provider_providerActivityId_key" ON "ExternalActivity"("provider", "providerActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalActivity_trainingEntryId_key" ON "ExternalActivity"("trainingEntryId");

-- CreateIndex
CREATE INDEX "ExternalActivity_athleteId_status_trainingDate_idx" ON "ExternalActivity"("athleteId", "status", "trainingDate");

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActivity" ADD CONSTRAINT "ExternalActivity_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActivity" ADD CONSTRAINT "ExternalActivity_connectedAccountId_fkey" FOREIGN KEY ("connectedAccountId") REFERENCES "ConnectedAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalActivity" ADD CONSTRAINT "ExternalActivity_trainingEntryId_fkey" FOREIGN KEY ("trainingEntryId") REFERENCES "TrainingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEntry" ADD CONSTRAINT "TrainingEntry_originExternalActivityId_fkey" FOREIGN KEY ("originExternalActivityId") REFERENCES "ExternalActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill
UPDATE "TrainingEntry" SET "origin" = 'MANUAL_PROOF' WHERE "origin" IS NULL;
