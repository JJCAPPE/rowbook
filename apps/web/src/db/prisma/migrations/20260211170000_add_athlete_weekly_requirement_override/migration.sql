-- CreateTable
CREATE TABLE "AthleteWeeklyRequirementOverride" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "weekStartAt" TIMESTAMP(3) NOT NULL,
    "requiredMinutes" INTEGER NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteWeeklyRequirementOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AthleteWeeklyRequirementOverride_athleteId_weekStartAt_key" ON "AthleteWeeklyRequirementOverride"("athleteId", "weekStartAt");

-- CreateIndex
CREATE INDEX "AthleteWeeklyRequirementOverride_weekStartAt_idx" ON "AthleteWeeklyRequirementOverride"("weekStartAt");

-- AddForeignKey
ALTER TABLE "AthleteWeeklyRequirementOverride" ADD CONSTRAINT "AthleteWeeklyRequirementOverride_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteWeeklyRequirementOverride" ADD CONSTRAINT "AthleteWeeklyRequirementOverride_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
