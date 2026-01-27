-- Add pace and watts columns to TrainingEntry
-- avgPace: Pace in seconds per unit (500m for erg, 1km for bike/run, 100m for swim)
-- avgWatts: Average watts (Concept2 only: ERG and CYCLE)

ALTER TABLE "TrainingEntry" ADD COLUMN "avgPace" DOUBLE PRECISION;
ALTER TABLE "TrainingEntry" ADD COLUMN "avgWatts" DOUBLE PRECISION;
