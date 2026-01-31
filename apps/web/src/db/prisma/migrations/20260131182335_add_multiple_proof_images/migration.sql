-- DropForeignKey
ALTER TABLE "TrainingEntry" DROP CONSTRAINT "TrainingEntry_proofImageId_fkey";

-- AlterTable
ALTER TABLE "ProofImage" ADD COLUMN     "trainingEntryId" TEXT;

-- AlterTable
ALTER TABLE "TrainingEntry" ALTER COLUMN "proofImageId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ProofImage" ADD CONSTRAINT "ProofImage_trainingEntryId_fkey" FOREIGN KEY ("trainingEntryId") REFERENCES "TrainingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEntry" ADD CONSTRAINT "TrainingEntry_proofImageId_fkey" FOREIGN KEY ("proofImageId") REFERENCES "ProofImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
