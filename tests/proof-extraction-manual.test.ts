import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import "dotenv/config";

import {
  extractProof,
  extractProofBatch,
  type ProofExtractionResponse,
} from "../apps/web/src/server/services/proof-extraction-service.ts";
import { evaluateAutoVerification } from "../apps/web/src/server/services/validation-logic.ts";

const fixtures = path.resolve("tests/test-photos");
const usage: Array<{ fixture: string; inputTokens: number; outputTokens: number; costUsd: number; coldCostUsd: number }> = [];
const activityLabelWarnings: Array<{ fixture: string; expected: string; actual: string | null }> = [];

const recordActivityLabel = (fixture: string, actual: string | null, expected: string) => {
  if (actual === expected) return;
  const warning = { fixture, expected, actual };
  activityLabelWarnings.push(warning);
  console.warn("provider activity-label warning", JSON.stringify(warning));
};

const recordCost = (fixture: string, result: ProofExtractionResponse) => {
  const { provider, model, inputTokens, outputTokens, cachedInputTokens = 0, cacheWriteTokens = 0 } = result.metadata;
  // Standard short-context rates checked September 28, 2026. Output includes reasoning.
  // https://developers.openai.com/api/docs/pricing
  if (provider !== "openai" || inputTokens === null || outputTokens === null) return;
  const rates = model === "gpt-6-luna"
    ? { input: 0.10, cached: 0.01, write: 0.125, output: 0.50 }
    : model === "gpt-6-sol"
      ? { input: 2, cached: 0.2, write: 2.5, output: 10 }
      : null;
  if (!rates) return;
  const cachedTokens = cachedInputTokens ?? 0;
  const writtenTokens = cacheWriteTokens ?? 0;
  usage.push({
    fixture,
    inputTokens,
    outputTokens,
    costUsd: ((inputTokens - cachedTokens - writtenTokens) * rates.input + cachedTokens * rates.cached + writtenTokens * rates.write + outputTokens * rates.output) / 1_000_000,
    // Unique future photos cannot rely on the repeated-fixture cache discount.
    coldCostUsd: (inputTokens * rates.write + outputTokens * rates.output) / 1_000_000,
  });
};

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

const assertMinutePolicy = (
  fixture: string,
  result: ProofExtractionResponse,
  expectedDate: string,
) => {
  const supportedMinutes = Math.floor((result.durationSeconds ?? 0) / 60);
  recordCost(fixture, result);
  const entry = {
    activityType: result.activityType ?? "OTHER",
    date: new Date(`${expectedDate}T12:00:00-05:00`),
    minutes: supportedMinutes,
    distance: 0,
    avgHr: null,
  };
  const decisions = {
    supportedMinutes: evaluateAutoVerification(entry, [result]),
    underclaim: evaluateAutoVerification({ ...entry, minutes: supportedMinutes - 1 }, [result]),
    extraMinute: evaluateAutoVerification({ ...entry, minutes: supportedMinutes + 1 }, [result]),
    wrongDate: evaluateAutoVerification({
      ...entry,
      date: new Date(entry.date.getTime() + 24 * 60 * 60 * 1_000),
    }, [result]),
    doubledMinutes: evaluateAutoVerification({ ...entry, minutes: supportedMinutes * 2 }, [result]),
  };
  console.info("provider benchmark", JSON.stringify({
    fixture,
    extracted: {
      activityType: result.activityType,
      date: result.date,
      durationSeconds: result.durationSeconds,
      elapsedSeconds: result.elapsedSeconds,
      minutes: result.minutes,
      distance: result.distance,
      avgHr: result.avgHr,
      confidence: result.confidence,
      isSingleWorkout: result.isSingleWorkout,
      reviewReason: result.reviewReason,
      sourceTypes: result.sourceTypes,
    },
    claims: {
      supportedMinutes,
      underclaim: supportedMinutes - 1,
      extraMinute: supportedMinutes + 1,
      doubledMinutes: supportedMinutes * 2,
    },
    decisions,
    durationMs: result.metadata.durationMs,
    inputTokens: result.metadata.inputTokens,
    outputTokens: result.metadata.outputTokens,
    cachedInputTokens: result.metadata.cachedInputTokens,
    cacheWriteTokens: result.metadata.cacheWriteTokens,
    reasoningTokens: result.metadata.reasoningTokens,
    provider: result.metadata.provider,
    model: result.metadata.model,
  }, null, 2));

  assert.ok(supportedMinutes > 1, "fixture must support positive exact and lower minute claims");
  assert.equal(result.minutes, supportedMinutes);
  assert.equal(decisions.supportedMinutes.validationStatus, "VERIFIED");
  assert.equal(decisions.underclaim.validationStatus, "VERIFIED");
  assert.equal(decisions.extraMinute.validationStatus, "PENDING");
  assert.equal(decisions.wrongDate.validationStatus, "PENDING");
  assert.equal(decisions.doubledMinutes.validationStatus, "PENDING");
};

test(
  "The configured provider reads the labeled Concept2, Garmin, and Strava evidence sets",
  { timeout: 8 * 60_000 },
  async (t) => {
    const provider = process.env.PROOF_EXTRACTION_PROVIDER ?? "openai";
    const apiKey = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
    assert.ok(apiKey, `An API key for ${provider} is required for this paid test`);
    const converted = fs.mkdtempSync(path.join(os.tmpdir(), "rowbook-proof-benchmark-"));
    t.after(() => fs.rmSync(converted, { recursive: true, force: true }));
    t.after(() => {
      if (!usage.length) return;
      const totalCostUsd = usage.reduce((sum, entry) => sum + entry.costUsd, 0);
      console.info("provider cost summary", JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-6-luna",
        samples: usage,
        activityLabelWarnings,
        totalCostUsd,
        projected500WorkoutsUsd: totalCostUsd / usage.length * 500,
        projected500AtMostExpensiveSampleUsd: Math.max(...usage.map((entry) => entry.costUsd)) * 500,
        projected500WithoutCacheDiscountUsd: usage.reduce((sum, entry) => sum + entry.coldCostUsd, 0) / usage.length * 500,
        projected500AtMostExpensiveColdSampleUsd: Math.max(...usage.map((entry) => entry.coldCostUsd)) * 500,
        note: "Measured returned-response usage; excludes hosting and any failed calls without reported usage. Future usage depends on photo count and resolution.",
      }, null, 2));
    });

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
      {
        name: "Garmin cardio",
        buffer: fs.readFileSync(path.join(fixtures, "garmin.PNG")),
        referenceDate: new Date("2026-02-01T17:00:00-05:00"),
        expected: { activityType: "OTHER", date: "2026-01-29", durationSeconds: 5_520, distance: null, avgHr: 125 },
      },
    ] as const;

    for (const fixture of cases) {
      await t.test(fixture.name, async () => {
        const result = await extractProof(fixture.buffer, {
          referenceDate: fixture.referenceDate,
        });
        assertMinutePolicy(fixture.name, result, fixture.expected.date);
        // Category is informational under the approval policy. Report OCR misses
        // separately; never relax the date, duration, or approval assertions.
        recordActivityLabel(fixture.name, result.activityType, fixture.expected.activityType);
        assert.equal(result.date, fixture.expected.date);
        assertClose(result.durationSeconds, fixture.expected.durationSeconds, 1);
        assert.equal(result.minutes, Math.floor(fixture.expected.durationSeconds / 60), "whole-minute credit must match the labeled photo, even at a one-second boundary");
        if (fixture.expected.distance === null) {
          assert.equal(result.distance, null);
        } else {
          assertClose(result.distance, fixture.expected.distance, 0.01);
        }
        assert.equal(result.avgHr, fixture.expected.avgHr);
        assert.equal(result.isSingleWorkout, true);
      });
    }

    await t.test("Strava elapsed-only evidence requires active-duration review", async () => {
      // This screenshot explicitly says Elapsed Time, not active/moving time.
      const result = await extractProof(fs.readFileSync(path.join(fixtures, "strava.PNG")), {
        referenceDate: new Date("2026-02-01T17:00:00-05:00"),
      });
      recordCost("Strava elapsed-only", result);
      const decision = evaluateAutoVerification({
        activityType: "OTHER",
        date: new Date("2026-01-29T12:00:00-05:00"),
        minutes: 91,
        distance: 0,
        avgHr: null,
      }, [result]);
      console.info("provider elapsed-only control", JSON.stringify({ result, decision }, null, 2));
      assert.equal(result.date, "2026-01-29");
      assert.equal(result.elapsedSeconds, 5_519);
      assert.equal(result.durationSeconds, null);
      assert.equal(result.minutes, null);
      assert.equal(result.isSingleWorkout, true);
      assert.ok(result.reviewReason);
      assert.notEqual(decision.validationStatus, "VERIFIED");
    });

    await t.test("Garmin and Strava are consolidated as one workout", async () => {
      const result = await extractProofBatch(
        [
          fs.readFileSync(path.join(fixtures, "garmin.PNG")),
          fs.readFileSync(path.join(fixtures, "strava.PNG")),
        ],
        { referenceDate: new Date("2026-02-01T17:00:00-05:00") },
      );
      assertMinutePolicy("Garmin + Strava", result, "2026-01-29");
      recordActivityLabel("Garmin + Strava", result.activityType, "OTHER");
      assert.equal(result.date, "2026-01-29");
      assert.equal(result.durationSeconds, 5_519, "Use the lower supported time for the one-second display discrepancy.");
      assert.equal(result.minutes, 91, "Never round 1:31:59 up to 92 whole minutes.");
      assert.equal(result.distance, null);
      assert.equal(result.avgHr, 125);
      assert.equal(result.isSingleWorkout, true);
      assert.ok(result.sourceTypes.includes("GARMIN"));
      assert.ok(result.sourceTypes.includes("STRAVA"));
    });

    await t.test("Different workouts cannot be combined into one approved claim", async () => {
      const result = await extractProofBatch(
        [cases[1].buffer, cases[2].buffer],
        { referenceDate: new Date("2025-02-12T17:00:00-05:00") },
      );
      recordCost("Different-workout negative control", result);
      const decision = evaluateAutoVerification({
        activityType: "CYCLE",
        date: new Date("2025-02-03T12:00:00-05:00"),
        minutes: 60,
        distance: 0,
        avgHr: null,
      }, [result]);
      console.info("provider negative control", JSON.stringify({ result, decision }, null, 2));
      assert.equal(result.isSingleWorkout, false);
      assert.notEqual(decision.validationStatus, "VERIFIED");
    });
  },
);
