import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateContentParameters } from "@google/genai";
import { ProofExtractedFieldsSchema } from "@rowbook/shared";

import {
  extractProofWithGemini,
  setGenAI,
} from "../../apps/web/src/server/services/proof-extraction-service.ts";

const image = Buffer.from([0xff, 0xd8, 0xff]);
const rawResult = {
  activityType: "ERG",
  date: "2026-09-27",
  durationSeconds: 3_580,
  elapsedSeconds: 3_700,
  distanceKm: null,
  avgHr: null,
  confidence: 0.99,
  isSingleWorkout: true,
  reviewReason: null,
  sourceTypes: ["CONCEPT2"],
};

const injectResult = (
  result: Record<string, unknown>,
  onRequest?: (request: GenerateContentParameters) => void,
) => {
  setGenAI({
    models: {
      generateContent: async (request: GenerateContentParameters) => {
        onRequest?.(request);
        return { text: JSON.stringify(result) };
      },
    },
  } as unknown as Parameters<typeof setGenAI>[0]);
};

test("extraction only supports complete active minutes and preserves exact seconds", async (t) => {
  t.after(() => setGenAI(null));

  for (const [durationSeconds, minutes] of [
    [3_580, 59],
    [3_599, 59],
    [3_600, 60],
    [59, 0],
    [1, 0],
  ]) {
    await t.test(`${durationSeconds} seconds supports ${minutes} minutes`, async () => {
      injectResult({ ...rawResult, durationSeconds });

      const result = await extractProofWithGemini(image);

      assert.equal(result.durationSeconds, durationSeconds);
      assert.equal(result.minutes, minutes);
      assert.equal(result.elapsedSeconds, 3_700);
      assert.equal(ProofExtractedFieldsSchema.parse(result).minutes, minutes);
    });
  }
});

test("elapsed time cannot fill in an unreadable active duration", async (t) => {
  t.after(() => setGenAI(null));
  injectResult({
    ...rawResult,
    durationSeconds: null,
    reviewReason: "Active work cannot be separated from rest.",
  });

  const result = await extractProofWithGemini(image);

  assert.equal(result.durationSeconds, null);
  assert.equal(result.minutes, null);
  assert.equal(result.elapsedSeconds, 3_700);
  assert.equal(result.reviewReason, "Active work cannot be separated from rest.");
});

test("the extraction request focuses review on valid workout time and date", async (t) => {
  t.after(() => setGenAI(null));
  let prompt = "";
  injectResult(rawResult, (request) => {
    prompt = JSON.stringify(request.contents);
  });

  const result = await extractProofWithGemini(image, {
    referenceDate: new Date("2026-09-28T12:00:00-04:00"),
  });

  assert.match(prompt, /one evidence set for one claimed workout/);
  assert.match(prompt, /never add a metric merely because it appears in both/);
  assert.match(prompt, /completed workout, not a planned workout or a timer setup/);
  assert.match(prompt, /exclude programmed rest/);
  assert.match(prompt, /Use null and a reviewReason if the workout date cannot be established/);
  assert.match(prompt, /Use null and a reviewReason if active duration cannot be established/);
  assert.match(prompt, /Conflicting dates or active durations require review/);
  assert.match(prompt, /distance, average heart rate, or activity category alone must not require review or lower confidence/);
  assert.match(prompt, /All listed activity categories are eligible/);
  assert.equal(result.reviewReason, null);
  assert.equal(result.confidence, 0.99);
  assert.equal(result.metadata.promptVersion, "workout-proof-v4");
  assert.equal(result.metadata.schemaVersion, "evidence-v3");
});
