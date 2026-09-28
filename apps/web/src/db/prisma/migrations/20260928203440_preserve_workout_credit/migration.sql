-- Existing submissions keep their original credit rules. New application writes opt into version 2.
ALTER TABLE "TrainingEntry" ADD COLUMN "creditPolicyVersion" INTEGER NOT NULL DEFAULT 1;
