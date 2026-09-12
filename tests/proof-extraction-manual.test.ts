import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import "dotenv/config";

import {
  extractProofWithGemini,
  extractProofWithGeminiBatch,
  ProofExtractionError,
} from "../apps/web/src/server/services/proof-extraction-service.ts";

const fixtures = path.resolve("tests/test-photos");

const convertHeic = (fileName: string, outputDirectory: string) => {
  const outputPath = path.join(outputDirectory, `${path.parse(fileName).name}.jpg`);
  execFileSync(
    "sips",
    ["-s", "format", "jpeg", path.join(fixtures, fileName), "--out", outputPath],
    { stdio: "ignore" },
  );
  return fs.readFileSync(outputPath);
};

const assertClose = (actual: number | null, expected: number, tolerance: number) => {
  assert.notEqual(actual, null);
  assert.ok(
    Math.abs((actual as number) - expected) <= tolerance,
    `expected ${expected} ± ${tolerance}, received ${actual}`,
  );
};

const withProviderRetry = async <T>(operation: () => Promise<T>) => {
  const retryDelaysMs = [15_000, 45_000, 90_000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const delayMs = retryDelaysMs[attempt];
      if (
        !(error instanceof ProofExtractionError) ||
        !error.retryable ||
        delayMs === undefined
      ) {
        throw error;
      }
      console.info("provider benchmark retry", {
        attempt: attempt + 1,
        code: error.code,
        delayMs,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
};

test(
  "Gemini reads the labeled Concept2, Garmin, and Strava evidence sets",
  { timeout: 8 * 60_000 },
  async (t) => {
    assert.ok(process.env.GEMINI_API_KEY, "GEMINI_API_KEY is required for this paid test");
    const converted = fs.mkdtempSync(path.join(os.tmpdir(), "rowbook-proof-benchmark-"));
    t.after(() => fs.rmSync(converted, { recursive: true, force: true }));

    const cases = [
      {
        name: "Concept2 RowErg",
        buffer: fs.readFileSync(path.join(fixtures, "IMG_0212.JPG")),
        referenceDate: new Date("2026-01-20T17:00:00-05:00"),
        expected: {
          activityType: "ERG",
          date: "2026-01-15",
          durationSeconds: 1_270,
          distance: 6,
          avgHr: null,
        },
      },
      {
        name: "Concept2 BikeErg 2x30",
        buffer: convertHeic("IMG_4031.HEIC", converted),
        referenceDate: new Date("2025-02-05T17:00:00-05:00"),
        expected: {
          activityType: "CYCLE",
          date: "2025-02-03",
          durationSeconds: 3_600,
          distance: 32.318,
          avgHr: 149,
        },
      },
      {
        name: "Concept2 BikeErg second session",
        buffer: convertHeic("IMG_4070.HEIC", converted),
        referenceDate: new Date("2025-02-12T17:00:00-05:00"),
        expected: {
          activityType: "CYCLE",
          date: "2025-02-10",
          durationSeconds: 3_600,
          distance: 32.281,
          avgHr: 136,
        },
      },
      {
        name: "Concept2 BikeErg 3x30",
        buffer: convertHeic("IMG_4074.HEIC", converted),
        referenceDate: new Date("2025-02-12T17:00:00-05:00"),
        expected: {
          activityType: "CYCLE",
          date: "2025-02-11",
          durationSeconds: 5_400,
          distance: 47.919,
          avgHr: 143,
        },
      },
    ] as const;

    for (const fixture of cases) {
      await t.test(fixture.name, async () => {
        const result = await withProviderRetry(() =>
          extractProofWithGemini(fixture.buffer, {
            referenceDate: fixture.referenceDate,
          }),
        );
        assert.equal(result.activityType, fixture.expected.activityType);
        assert.equal(result.date, fixture.expected.date);
        assertClose(result.durationSeconds, fixture.expected.durationSeconds, 1);
        assertClose(result.distance, fixture.expected.distance, 0.01);
        assert.equal(result.avgHr, fixture.expected.avgHr);
        assert.equal(result.isSingleWorkout, true);
        console.info("provider benchmark", {
          fixture: fixture.name,
          durationMs: result.metadata.durationMs,
          inputTokens: result.metadata.inputTokens,
          outputTokens: result.metadata.outputTokens,
          model: result.metadata.model,
        });
      });
    }

    await t.test("Garmin and Strava are consolidated as one workout", async () => {
      const result = await withProviderRetry(() =>
        extractProofWithGeminiBatch(
          [
            fs.readFileSync(path.join(fixtures, "garmin.PNG")),
            fs.readFileSync(path.join(fixtures, "strava.PNG")),
          ],
          { referenceDate: new Date("2026-02-01T17:00:00-05:00") },
        ),
      );
      assert.equal(result.activityType, "OTHER");
      assert.equal(result.date, "2026-01-29");
      assertClose(result.durationSeconds, 5_520, 2);
      assert.equal(result.minutes, 92);
      assert.equal(result.distance, null);
      assert.equal(result.avgHr, 125);
      assert.equal(result.isSingleWorkout, true);
      assert.ok(result.sourceTypes.includes("GARMIN"));
      assert.ok(result.sourceTypes.includes("STRAVA"));
      console.info("provider benchmark", {
        fixture: "Garmin + Strava",
        durationMs: result.metadata.durationMs,
        inputTokens: result.metadata.inputTokens,
        outputTokens: result.metadata.outputTokens,
        model: result.metadata.model,
      });
    });
  },
);
