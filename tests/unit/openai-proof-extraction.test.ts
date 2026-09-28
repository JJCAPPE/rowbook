import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { GenerateContentParameters } from "@google/genai";

import {
  extractProof,
  extractProofBatch,
  ProofExtractionError,
  setGenAI,
} from "../../apps/web/src/server/services/proof-extraction-service.ts";

const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
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
  sourceTypes: ["CONCEPT2", "CONCEPT2"],
};

const responseBody = (text = JSON.stringify(rawResult)) => ({
  id: "resp_test",
  object: "response",
  status: "completed",
  model: "gpt-6-luna-test-version",
  output: [{
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  }],
  usage: {
    input_tokens: 400,
    output_tokens: 125,
    total_tokens: 525,
    input_tokens_details: { cached_tokens: 100, cache_write_tokens: 40 },
    output_tokens_details: { reasoning_tokens: 25 },
  },
});

const configureEnvironment = (
  t: TestContext,
  overrides: Record<string, string | undefined> = {},
) => {
  const values = {
    OPENAI_API_KEY: "test-openai-key",
    GEMINI_API_KEY: "test-gemini-key",
    PROOF_EXTRACTION_PROVIDER: undefined,
    OPENAI_MODEL: undefined,
    GEMINI_MODEL: undefined,
    ...overrides,
  };
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    setGenAI(null);
  });
};

const assertExtractionFailure = async (
  operation: () => Promise<unknown>,
  code: ProofExtractionError["code"],
  retryable: boolean,
) => assert.rejects(operation, (error: unknown) => {
  assert.ok(error instanceof ProofExtractionError);
  assert.equal(error.code, code);
  assert.equal(error.retryable, retryable);
  assert.doesNotMatch(error.message, /private-provider-detail|test-openai-key|test-gemini-key/);
  return true;
});

test("OpenAI is the default and sends all photos once with strict structured output", async (t) => {
  configureEnvironment(t);
  let requestBody: Record<string, any> | undefined;
  const fetch = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-openai-key");
    assert.equal(headers.get("content-type"), "application/json");
    assert.ok(init?.signal instanceof AbortSignal);
    requestBody = JSON.parse(String(init?.body));
    return Response.json(responseBody());
  });

  const result = await extractProofBatch([jpeg, png], {
    referenceDate: new Date("2026-09-28T12:00:00-04:00"),
  });

  assert.equal(fetch.mock.callCount(), 1);
  assert.ok(requestBody);
  assert.equal(requestBody.model, "gpt-6-luna");
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.reasoning?.effort, "low");
  assert.equal(requestBody.max_output_tokens, 2000);
  const format = requestBody.text?.format;
  assert.equal(format?.type, "json_schema");
  assert.equal(format?.strict, true);
  assert.equal(format?.schema.additionalProperties, false);
  assert.deepEqual([...format.schema.required].sort(), Object.keys(format.schema.properties).sort());
  const content = requestBody.input.flatMap((message: { content: any[] }) => message.content);
  const photos = content.filter((item: { type: string }) => item.type === "input_image");
  assert.deepEqual(photos, [
    { type: "input_image", image_url: `data:image/jpeg;base64,${jpeg.toString("base64")}`, detail: "high" },
    { type: "input_image", image_url: `data:image/png;base64,${png.toString("base64")}`, detail: "high" },
  ]);
  const prompt = content.find((item: { type: string }) => item.type === "input_text")?.text;
  assert.match(prompt, /2026-09-28/);
  assert.match(prompt, /exclude programmed rest/);
  assert.match(prompt, /never add a metric merely because it appears in both/);
  assert.equal(result.minutes, 59);
  assert.equal(result.durationSeconds, 3_580);
  assert.equal(result.elapsedSeconds, 3_700);
  assert.deepEqual(result.sourceTypes, ["CONCEPT2"]);
  assert.equal(result.metadata.provider, "openai");
  assert.equal(result.metadata.model, "gpt-6-luna");
  assert.equal(result.metadata.modelVersion, "gpt-6-luna-test-version");
  assert.equal(result.metadata.inputTokens, 400);
  assert.equal(result.metadata.outputTokens, 125);
  assert.equal(result.metadata.cachedInputTokens, 100);
  assert.equal(result.metadata.cacheWriteTokens, 40);
  assert.equal(result.metadata.reasoningTokens, 25);
  assert.ok(result.metadata.durationMs >= 0);
});

test("OpenAI respects its model override independently of the Gemini model", async (t) => {
  configureEnvironment(t, { OPENAI_MODEL: "openai-model-override", GEMINI_MODEL: "gemini-model-override" });
  const requestedModels: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requestedModels.push(JSON.parse(String(init?.body)).model);
    return Response.json(responseBody());
  });

  assert.equal((await extractProof(jpeg)).metadata.model, "openai-model-override");
  assert.equal((await extractProof(jpeg, { model: "per-request-model" })).metadata.model, "per-request-model");
  assert.deepEqual(requestedModels, ["openai-model-override", "per-request-model"]);
});

test("explicit Gemini selection keeps the alternate provider available", async (t) => {
  configureEnvironment(t, { PROOF_EXTRACTION_PROVIDER: "gemini", GEMINI_MODEL: "gemini-model-override" });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected OpenAI request");
  });
  let requestedModel: string | undefined;
  setGenAI({
    models: {
      generateContent: async (request: GenerateContentParameters) => {
        requestedModel = request.model;
        return { text: JSON.stringify(rawResult) };
      },
    },
  } as unknown as Parameters<typeof setGenAI>[0]);

  const result = await extractProof(jpeg);

  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(requestedModel, "gemini-model-override");
  assert.equal(result.metadata.provider, "gemini");
  assert.equal(result.minutes, 59);
});

test("OpenAI preserves unreadable active time and never substitutes elapsed time", async (t) => {
  configureEnvironment(t);
  t.mock.method(globalThis, "fetch", async () => Response.json(responseBody(JSON.stringify({
    ...rawResult,
    durationSeconds: null,
    reviewReason: "Active work cannot be separated from rest.",
  }))));

  const result = await extractProof(jpeg);

  assert.equal(result.durationSeconds, null);
  assert.equal(result.minutes, null);
  assert.equal(result.elapsedSeconds, 3_700);
  assert.equal(result.reviewReason, "Active work cannot be separated from rest.");
});

test("OpenAI metadata remains unknown when usage is absent", async (t) => {
  configureEnvironment(t);
  const { usage: _usage, ...body } = responseBody();
  t.mock.method(globalThis, "fetch", async () => Response.json(body));

  const { metadata } = await extractProof(jpeg);

  assert.equal(metadata.inputTokens, null);
  assert.equal(metadata.outputTokens, null);
  assert.equal(metadata.cachedInputTokens ?? null, null);
  assert.equal(metadata.cacheWriteTokens ?? null, null);
  assert.equal(metadata.reasoningTokens ?? null, null);
});

test("OpenAI preserves zero usage counts instead of treating them as unknown", async (t) => {
  configureEnvironment(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({
    ...responseBody(),
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  }));

  const { metadata } = await extractProof(jpeg);

  assert.equal(metadata.inputTokens, 0);
  assert.equal(metadata.outputTokens, 0);
  assert.equal(metadata.cachedInputTokens, 0);
  assert.equal(metadata.cacheWriteTokens, 0);
  assert.equal(metadata.reasoningTokens, 0);
});

test("incomplete, refused, and malformed OpenAI output cannot validate a workout", async (t) => {
  configureEnvironment(t);
  const complete = responseBody();
  const responses = [
    { label: "incomplete despite readable output", body: { ...complete, status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } },
    { label: "failed response", body: { ...complete, status: "failed", error: { message: "private-provider-detail" } } },
    { label: "refusal", body: { ...complete, output: [{ type: "message", content: [{ type: "refusal", refusal: "private-provider-detail" }] }] } },
    { label: "refusal alongside readable output", body: { ...complete, output: [...complete.output, { type: "message", content: [{ type: "refusal", refusal: "private-provider-detail" }] }] } },
    { label: "missing output", body: { ...complete, output: [] } },
    { label: "malformed JSON text", body: responseBody("private-provider-detail") },
    { label: "missing required fields", body: responseBody(JSON.stringify({ durationSeconds: 60 })) },
    { label: "invalid duration", body: responseBody(JSON.stringify({ ...rawResult, durationSeconds: -1 })) },
  ];
  for (const { label, body } of responses) {
    await t.test(label, async (child) => {
      child.mock.method(globalThis, "fetch", async () => Response.json(body));
      await assertExtractionFailure(() => extractProof(jpeg), "invalid-response", false);
    });
  }
  await t.test("non-JSON response envelope", async (child) => {
    child.mock.method(globalThis, "fetch", async () => new Response("private-provider-detail", { status: 200 }));
    await assertExtractionFailure(() => extractProof(jpeg), "invalid-response", false);
  });
});

test("provider failures are sanitized and never silently fall back to Gemini", async (t) => {
  configureEnvironment(t);
  let geminiCalls = 0;
  setGenAI({
    models: {
      generateContent: async () => {
        geminiCalls += 1;
        return { text: JSON.stringify(rawResult) };
      },
    },
  } as unknown as Parameters<typeof setGenAI>[0]);
  for (const [status, code, retryable] of [
    [401, "configuration", false],
    [429, "rate-limited", true],
    [503, "provider-unavailable", true],
  ] as const) {
    await t.test(`HTTP ${status}`, async (child) => {
      const fetch = child.mock.method(globalThis, "fetch", async () => Response.json({
        error: { message: "private-provider-detail test-openai-key" },
      }, { status }));
      await assertExtractionFailure(() => extractProof(jpeg), code, retryable);
      assert.equal(fetch.mock.callCount(), 1);
    });
  }
  await t.test("timeout", async (child) => {
    child.mock.method(globalThis, "fetch", async () => {
      throw new DOMException("private-provider-detail", "AbortError");
    });
    await assertExtractionFailure(() => extractProof(jpeg), "timeout", true);
  });
  await t.test("AbortSignal timeout", async (child) => {
    child.mock.method(globalThis, "fetch", async () => {
      throw new DOMException("private-provider-detail", "TimeoutError");
    });
    await assertExtractionFailure(() => extractProof(jpeg), "timeout", true);
  });
  await t.test("network failure", async (child) => {
    child.mock.method(globalThis, "fetch", async () => {
      throw new TypeError("private-provider-detail");
    });
    await assertExtractionFailure(() => extractProof(jpeg), "provider-unavailable", true);
  });
  assert.equal(geminiCalls, 0);
});

test("missing OpenAI configuration and invalid providers fail before any request", async (t) => {
  for (const { label, overrides } of [
    { label: "missing OpenAI key", overrides: { OPENAI_API_KEY: undefined } },
    { label: "invalid provider", overrides: { PROOF_EXTRACTION_PROVIDER: "unsupported-provider" } },
  ]) {
    await t.test(label, async (child) => {
      configureEnvironment(child, overrides);
      const fetch = child.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected provider request");
      });
      let geminiCalls = 0;
      setGenAI({ models: { generateContent: async () => { geminiCalls += 1; } } } as unknown as Parameters<typeof setGenAI>[0]);
      await assertExtractionFailure(() => extractProof(jpeg), "configuration", false);
      assert.equal(fetch.mock.callCount(), 0);
      assert.equal(geminiCalls, 0);
    });
  }
});
