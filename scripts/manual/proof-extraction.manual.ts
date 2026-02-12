import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { extractProofWithGemini } from "../../apps/web/src/server/services/proof-extraction-service.ts";

const rootDir = path.resolve(import.meta.dirname, "..", "..");

const processImage = async (
  imagePath: string,
  expectedMinutes: number,
  expectedDate: string,
) => {
  const buffer = fs.readFileSync(imagePath);
  const result = await extractProofWithGemini(buffer);

  assert.ok(result, "Extraction result is required.");
  assert.equal(
    result.date,
    expectedDate,
    `Date mismatch for ${path.basename(imagePath)}. Expected ${expectedDate}, got ${result.date}.`,
  );

  assert.ok(result.minutes !== null, "Minutes should be present.");
  if (result.minutes !== null) {
    const diff = Math.abs(result.minutes - expectedMinutes);
    assert.ok(
      diff <= 1,
      `Minutes mismatch for ${path.basename(imagePath)}. Expected ${expectedMinutes} (+/- 1), got ${result.minutes}.`,
    );
  }
};

const main = async () => {
  const garminPath = path.join(rootDir, "tests", "garmin.PNG");
  const stravaPath = path.join(rootDir, "tests", "strava.PNG");

  await processImage(garminPath, 92, "2026-01-29");
  await processImage(stravaPath, 92, "2026-01-29");
  console.log("Manual proof extraction check passed.");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
