import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateContentParameters } from "@google/genai";
import { ProofExtractedFieldsSchema } from "@rowbook/shared";

import {
  extractProofWithGemini,
  extractProofWithGeminiBatch,
  ProofExtractionError,
  setGenAI,
} from "../../apps/web/src/server/services/proof-extraction-service.ts";
import { evaluateAutoVerification } from "../../apps/web/src/server/services/validation-logic.ts";

const image = Buffer.from([0xff, 0xd8, 0xff]);
const rawResult = {
  activityType: "ERG",
  pieces: [{ imageIndices: [1], date: "2026-09-27", durationSeconds: 3_580, elapsedSeconds: 3_700 }],
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
      injectResult({ ...rawResult, pieces: [{ ...rawResult.pieces[0], durationSeconds }] });

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
    pieces: [{ ...rawResult.pieces[0], durationSeconds: null }],
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
  assert.match(prompt, /Conflicting dates or active durations within the same piece require review/);
  assert.match(prompt, /distance, average heart rate, or activity category alone must not require review or lower confidence/);
  assert.match(prompt, /All listed activity categories are eligible/);
  assert.equal(result.reviewReason, null);
  assert.equal(result.confidence, 0.99);
  assert.equal(result.metadata.promptVersion, "workout-proof-v5");
  assert.equal(result.metadata.schemaVersion, "evidence-v4");
});

test("distinct completed pieces are summed in code before flooring whole minutes", async (t) => {
  t.after(() => setGenAI(null));
  for (const { durations, seconds, minutes } of [
    { durations: [1_200, 1_200], seconds: 2_400, minutes: 40 },
    { durations: [1_350, 1_350], seconds: 2_700, minutes: 45 },
    { durations: [1_200, 1_500], seconds: 2_700, minutes: 45 },
    { durations: [601, 1_200, 1_200], seconds: 3_001, minutes: 50 },
    { durations: [1_229, 1_471], seconds: 2_700, minutes: 45 },
    { durations: [1_229, 1_470], seconds: 2_699, minutes: 44 },
  ]) {
    injectResult({
      ...rawResult,
      pieces: durations.map((durationSeconds, index) => ({
        imageIndices: [index + 1], date: "2026-09-27", durationSeconds, elapsedSeconds: null,
      })),
    });
    const images = durations.map((_, index) => Buffer.concat([image, Buffer.from([index])]));
    const result = await extractProofWithGeminiBatch(images);
    assert.equal(result.durationSeconds, seconds);
    assert.equal(result.minutes, minutes);
    assert.equal(result.elapsedSeconds, null);
    assert.equal(result.isSingleWorkout, true);
    assert.equal(result.reviewReason, null);
    const entry = { activityType: "ERG" as const, date: new Date("2026-09-27T12:00:00-04:00"), minutes, distance: 0 };
    assert.equal(evaluateAutoVerification(entry, [result]).validationStatus, "VERIFIED");
    assert.equal(evaluateAutoVerification({ ...entry, minutes: minutes + 1 }, [result]).validationStatus, "PENDING");
  }
});

test("complementary and duplicate photos contribute one piece only", async (t) => {
  t.after(() => setGenAI(null));
  injectResult({ ...rawResult, pieces: [{ ...rawResult.pieces[0], imageIndices: [1, 2] }] });
  const result = await extractProofWithGeminiBatch([image, image]);
  assert.equal(result.durationSeconds, 3_580);
  assert.equal(result.isSingleWorkout, true);
  assert.equal(result.reviewReason, null);
});

test("invalid image attribution cannot produce an aggregate", async (t) => {
  t.after(() => setGenAI(null));
  const secondImage = Buffer.concat([image, Buffer.from([2])]);
  for (const imageIndices of [[[1]], [[1], [1, 2]], [[1], [3]], [[1, 1], [2]], [[], [1, 2]]]) {
    injectResult({
      ...rawResult,
      pieces: imageIndices.map((indices) => ({ ...rawResult.pieces[0], imageIndices: indices })),
    });
    await assert.rejects(() => extractProofWithGeminiBatch([image, secondImage]), (error) => {
      assert.ok(error instanceof ProofExtractionError);
      assert.equal(error.code, "invalid-response");
      return true;
    });
  }
});

test("ambiguous pieces cannot support automatic verification", async (t) => {
  t.after(() => setGenAI(null));
  const secondImage = Buffer.concat([image, Buffer.from([2])]);
  for (const change of [
    { date: "2026-09-28" },
    { date: null },
    { date: "2026-02-30" },
    { durationSeconds: null },
    { durationSeconds: 4_000 },
  ]) {
    injectResult({
      ...rawResult,
      pieces: [rawResult.pieces[0], { ...rawResult.pieces[0], imageIndices: [2], ...change }],
    });
    const result = await extractProofWithGeminiBatch([image, secondImage]);
    assert.equal(result.isSingleWorkout, false);
    assert.ok(result.reviewReason);
    assert.ok(result.date === null || result.durationSeconds === null);
  }

  injectResult({
    ...rawResult,
    pieces: [rawResult.pieces[0], { ...rawResult.pieces[0], imageIndices: [2] }],
  });
  const duplicate = await extractProofWithGeminiBatch([image, image]);
  assert.equal(duplicate.durationSeconds, null);
  assert.equal(duplicate.isSingleWorkout, false);
  assert.match(duplicate.reviewReason ?? "", /same photo/);
});

test("an impossible date cannot normalize into an approved single-piece workout", async (t) => {
  t.after(() => setGenAI(null));
  injectResult({ ...rawResult, pieces: [{ ...rawResult.pieces[0], date: "2026-02-30" }] });
  const result = await extractProofWithGemini(image);
  assert.equal(result.date, null);
  assert.equal(result.durationSeconds, null);
  assert.equal(result.isSingleWorkout, false);
  assert.ok(result.reviewReason);
});

test("piece rounding and daily duration bounds remain conservative", async (t) => {
  t.after(() => setGenAI(null));
  injectResult({
    ...rawResult,
    pieces: [{ ...rawResult.pieces[0], durationSeconds: 3_601, elapsedSeconds: 3_600 }],
  });
  const rounded = await extractProofWithGemini(image);
  assert.equal(rounded.durationSeconds, 3_600);
  assert.equal(rounded.reviewReason, null);

  injectResult({
    ...rawResult,
    pieces: [1, 2].map((index) => ({
      ...rawResult.pieces[0], imageIndices: [index], durationSeconds: 50_000, elapsedSeconds: null,
    })),
  });
  const tooLong = await extractProofWithGeminiBatch([image, Buffer.concat([image, Buffer.from([2])])]);
  assert.equal(tooLong.durationSeconds, null);
  assert.equal(tooLong.isSingleWorkout, false);
  assert.ok(tooLong.reviewReason);
});

test("model uncertainty about overlapping pieces still requires review", async (t) => {
  t.after(() => setGenAI(null));
  injectResult({
    ...rawResult,
    pieces: [{ ...rawResult.pieces[0], imageIndices: [1, 2] }],
    isSingleWorkout: false,
    reviewReason: "The screens may show overlapping work.",
  });
  const result = await extractProofWithGeminiBatch([image, Buffer.concat([image, Buffer.from([2])])]);
  assert.equal(result.isSingleWorkout, false);
  assert.equal(result.reviewReason, "The screens may show overlapping work.");
  assert.equal(evaluateAutoVerification({
    activityType: "ERG", date: new Date("2026-09-27T12:00:00-04:00"), minutes: 30, distance: 0,
  }, [result]).validationStatus, "PENDING");
});
