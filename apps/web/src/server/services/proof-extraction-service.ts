import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  EvidenceExtractionResultSchema,
  nowInZone,
  toZonedDateTime,
  type EvidenceExtractionResult,
} from "@rowbook/shared";
import { z } from "zod";

export const EXTRACTION_PROVIDER = "openai";
export const EXTRACTION_PROMPT_VERSION = "workout-proof-v4";
export const EXTRACTION_SCHEMA_VERSION = "evidence-v3";
export const DEFAULT_EXTRACTION_MODEL = "gpt-6-luna";
export const DEFAULT_GEMINI_EXTRACTION_MODEL = "gemini-3.8-flash";
export const EXTRACTION_TIMEOUT_MS = 60_000;

const RawExtractionSchema = z.object({
  activityType: z.enum(["ERG", "RUN", "CYCLE", "SWIM", "OTHER"]).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  durationSeconds: z.number().int().positive().max(24 * 60 * 60).nullable(),
  elapsedSeconds: z.number().int().positive().max(24 * 60 * 60).nullable(),
  distanceKm: z.number().nonnegative().max(500).nullable(),
  avgHr: z.number().int().min(30).max(240).nullable(),
  confidence: z.number().min(0).max(1),
  isSingleWorkout: z.boolean(),
  reviewReason: z.string().trim().min(1).max(500).nullable(),
  sourceTypes: z.array(z.enum(["CONCEPT2", "GARMIN", "STRAVA", "OTHER"])).max(8),
});

const responseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    activityType: {
      anyOf: [
        { type: "string", enum: ["ERG", "RUN", "CYCLE", "SWIM", "OTHER"] },
        { type: "null" },
      ],
      description: "Normalized Rowbook activity type, or null when unclear.",
    },
    date: {
      anyOf: [{ type: "string", format: "date" }, { type: "null" }],
      description: "Workout date in YYYY-MM-DD form.",
    },
    durationSeconds: {
      anyOf: [{ type: "integer", minimum: 1, maximum: 86400 }, { type: "null" }],
      description: "Active working duration only, in seconds.",
    },
    elapsedSeconds: {
      anyOf: [{ type: "integer", minimum: 1, maximum: 86400 }, { type: "null" }],
      description: "Elapsed duration including rests, when separately visible.",
    },
    distanceKm: {
      anyOf: [{ type: "number", minimum: 0, maximum: 500 }, { type: "null" }],
      description: "Workout distance converted to kilometers.",
    },
    avgHr: {
      anyOf: [{ type: "integer", minimum: 30, maximum: 240 }, { type: "null" }],
      description: "Average heart rate in beats per minute, never max HR or cadence.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "Confidence that the evidence supports one completed workout, its date, and its active duration.",
    },
    isSingleWorkout: {
      type: "boolean",
      description: "Whether all images can safely be treated as evidence for one workout.",
    },
    reviewReason: {
      anyOf: [{ type: "string", minLength: 1, maxLength: 500 }, { type: "null" }],
      description: "Uncertainty about a completed workout, its date, active duration, or single-session validity; otherwise null.",
    },
    sourceTypes: {
      type: "array",
      maxItems: 8,
      items: { type: "string", enum: ["CONCEPT2", "GARMIN", "STRAVA", "OTHER"] },
    },
  },
  required: [
    "activityType",
    "date",
    "durationSeconds",
    "elapsedSeconds",
    "distanceKm",
    "avgHr",
    "confidence",
    "isSingleWorkout",
    "reviewReason",
    "sourceTypes",
  ],
} as const;

export type ExtractionMetadata = {
  provider: "openai" | "gemini";
  model: string;
  modelVersion: string | null;
  promptVersion: typeof EXTRACTION_PROMPT_VERSION;
  schemaVersion: typeof EXTRACTION_SCHEMA_VERSION;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens?: number | null;
  cacheWriteTokens?: number | null;
  reasoningTokens?: number | null;
};

export type ProofExtractionResponse = EvidenceExtractionResult & {
  metadata: ExtractionMetadata;
};

export type ProofExtractionFailureCode =
  | "configuration"
  | "invalid-image"
  | "timeout"
  | "rate-limited"
  | "provider-unavailable"
  | "invalid-response";

export class ProofExtractionError extends Error {
  readonly code: ProofExtractionFailureCode;
  readonly retryable: boolean;

  constructor(
    code: ProofExtractionFailureCode,
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = "ProofExtractionError";
    this.code = code;
    this.retryable = retryable;
  }
}

type GeminiClient = Pick<GoogleGenAI, "models">;
let injectedClient: GeminiClient | null = null;

export const setGenAI = (client: GeminiClient | null) => {
  injectedClient = client;
};

const getGenAI = (): GeminiClient => {
  if (injectedClient) return injectedClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ProofExtractionError(
      "configuration",
      "Automatic photo checking is temporarily unavailable.",
      false,
    );
  }

  injectedClient = new GoogleGenAI({ apiKey });
  return injectedClient;
};

export const detectImageMimeType = (imageBuffer: Buffer) => {
  if (
    imageBuffer.length >= 8 &&
    imageBuffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png" as const;
  }
  if (
    imageBuffer.length >= 3 &&
    imageBuffer[0] === 0xff &&
    imageBuffer[1] === 0xd8 &&
    imageBuffer[2] === 0xff
  ) {
    return "image/jpeg" as const;
  }
  if (
    imageBuffer.length >= 12 &&
    imageBuffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    imageBuffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp" as const;
  }

  throw new ProofExtractionError(
    "invalid-image",
    "The uploaded file is not a supported workout photo.",
    false,
  );
};

const buildPrompt = (referenceDate: Date) => {
  const dateContext = toZonedDateTime(referenceDate).toISODate() ?? nowInZone().toISODate() ?? "";

  return `You extract structured data from workout-proof images for a rowing team.
Reference date in America/New_York: ${dateContext}.

Treat every supplied image as one evidence set for one claimed workout. Consolidate complementary screens, but never add a metric merely because it appears in both Garmin and Strava or in multiple photos of the same screen.

Rules:
- Evidence must show a completed workout, not a planned workout or a timer setup. All listed activity categories are eligible.
- date: the workout date, YYYY-MM-DD. Preserve an explicitly displayed year. Resolve today/yesterday against ${dateContext}. Only when the year is omitted, choose the most recent non-future occurrence of the displayed month and day; applying this rule alone does not require review or lower confidence. Use null and a reviewReason if the workout date cannot be established.
- durationSeconds: ACTIVE WORK only, in exact seconds; never round up. On a completed single-session summary, a plain workout Time, Duration, or Total Time is the recorded workout duration unless the evidence separately identifies rest or paused time. Do not invent rests merely because a separate moving-time field is absent. A value explicitly labeled Elapsed Time is not by itself evidence of active duration. On Concept2 PM5 interval summaries, use the main work row or sum work intervals and exclude programmed rest. For example, 2×30:00/1:00r is 3600 active seconds even when Total Time is 1:02:00; 3×30:00/1:00r is 5400 seconds even when Total Time is 1:33:00. Use null and a reviewReason if active duration cannot be established, including when work cannot be separated from rest.
- Read each time as one value, preserving its separators and displayed units: H:MM:SS is 3600×H + 60×MM + SS, and M:SS is 60×M + SS. Drop fractional seconds rather than rounding up. Never combine digits from different fields or images.
- For images confidently showing the same session, otherwise reliable duration readings differing by at most one second can reflect display rounding. Use the smaller value and do not require review solely for that difference. If an independently supported active duration exceeds that session's displayed elapsed duration by at most one second, conservatively cap active duration at the elapsed value. This does not make elapsed-only evidence sufficient; larger contradictions require review.
- elapsedSeconds: the separate total/elapsed value including rests when visible; otherwise null.
- distanceKm: the main workout distance converted from meters/miles to kilometers. Do not sum split rows below a total row.
- avgHr: only a clearly labeled average heart rate. Prefer a Garmin/Strava average HR over PM5 cadence, stroke rate, rpm, max HR, or recovery values.
- activityType: Concept2 RowErg is ERG; Concept2 BikeErg/cycling is CYCLE. If a Concept2 PM5 screen has an rpm column, return CYCLE, not ERG. An s/m column means strokes per minute, not rpm. Do not assume every Concept2 PM5 screen is rowing. Normalize other visible activities to RUN, SWIM, or OTHER; use null if the category alone is unclear.
- isSingleWorkout: false if the images plausibly show separate sessions rather than the same/complementary session.
- reviewReason: one plain-language sentence only when completed-workout validity, date, active duration, or single-session validity requires review; otherwise null. Conflicting dates or active durations require review, except for the conservative same-session one-second rounding rule above. Missing, uncertain, or differing distance, average heart rate, or activity category alone must not require review or lower confidence; use null for an incidental field that cannot be resolved. Still flag evidence that suggests separate sessions.
- confidence: confidence that the evidence supports one completed workout, its date, and its active duration, not image authenticity or the incidental distance, average heart rate, and activity category values.

Return only the requested JSON object.`;
};

const classifyProviderError = (error: unknown) => {
  if (error instanceof ProofExtractionError) return error;

  const candidate = error as { status?: number; name?: string; message?: string };
  if (candidate.status === 429) {
    return new ProofExtractionError(
      "rate-limited",
      "Automatic photo checking is busy and will retry shortly.",
      true,
    );
  }
  if (
    candidate.name === "AbortError" ||
    candidate.name === "TimeoutError" ||
    /timeout/i.test(candidate.message ?? "")
  ) {
    return new ProofExtractionError(
      "timeout",
      "Automatic photo checking took too long and will retry.",
      true,
    );
  }
  if (candidate.status && candidate.status >= 400 && candidate.status < 500) {
    return new ProofExtractionError(
      "configuration",
      "Automatic photo checking is temporarily unavailable.",
      false,
    );
  }
  return new ProofExtractionError(
    "provider-unavailable",
    "Automatic photo checking is temporarily unavailable and will retry.",
    true,
  );
};

const getImageMimeTypes = (imageBuffers: Buffer[]) => {
  if (imageBuffers.length === 0) {
    throw new ProofExtractionError(
      "invalid-image",
      "At least one workout photo is required.",
      false,
    );
  }

  return imageBuffers.map(detectImageMimeType);
};

const parseExtractionResult = (text: string): EvidenceExtractionResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProofExtractionError(
      "invalid-response",
      "The photo check returned an unreadable result and needs manual review.",
      false,
    );
  }

  const parsed = RawExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProofExtractionError(
      "invalid-response",
      "The photo check returned incomplete data and needs manual review.",
      false,
    );
  }

  return EvidenceExtractionResultSchema.parse({
    activityType: parsed.data.activityType,
    date: parsed.data.date,
    durationSeconds: parsed.data.durationSeconds,
    elapsedSeconds: parsed.data.elapsedSeconds,
    minutes:
      parsed.data.durationSeconds === null
        ? null
        : Math.floor(parsed.data.durationSeconds / 60),
    distance: parsed.data.distanceKm,
    avgHr: parsed.data.avgHr,
    confidence: parsed.data.confidence,
    isSingleWorkout: parsed.data.isSingleWorkout,
    reviewReason: parsed.data.reviewReason,
    sourceTypes: [...new Set(parsed.data.sourceTypes)],
  });
};

const OpenAIResponseSchema = z.object({
  status: z.literal("completed"),
  error: z.null().optional(),
  incomplete_details: z.null().optional(),
  model: z.string().optional(),
  output: z.array(z.union([
    z.object({
      type: z.literal("message"),
      role: z.literal("assistant"),
      status: z.literal("completed"),
      content: z.array(z.object({
        type: z.literal("output_text"),
        text: z.string(),
      })).min(1),
    }),
    z.object({ type: z.literal("reasoning") }),
  ])),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    input_tokens_details: z.object({
      cached_tokens: z.number().int().nonnegative().optional(),
      cache_write_tokens: z.number().int().nonnegative().optional(),
    }).nullish(),
    output_tokens_details: z.object({
      reasoning_tokens: z.number().int().nonnegative().optional(),
    }).nullish(),
  }).nullish(),
});

type ExtractionOptions = { referenceDate?: Date; model?: string };

export const extractProof = async (
  imageBuffer: Buffer,
  options?: ExtractionOptions,
) => extractProofBatch([imageBuffer], options);

export const extractProofBatch = async (
  imageBuffers: Buffer[],
  options: ExtractionOptions = {},
): Promise<ProofExtractionResponse> => {
  const provider = process.env.PROOF_EXTRACTION_PROVIDER ?? EXTRACTION_PROVIDER;
  if (provider === "gemini") return extractProofWithGeminiBatch(imageBuffers, options);
  if (provider !== "openai") {
    throw new ProofExtractionError(
      "configuration",
      "Automatic photo checking is temporarily unavailable.",
      false,
    );
  }

  const mimeTypes = getImageMimeTypes(imageBuffers);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ProofExtractionError(
      "configuration",
      "Automatic photo checking is temporarily unavailable.",
      false,
    );
  }

  const referenceDate = options.referenceDate ?? nowInZone().toJSDate();
  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_EXTRACTION_MODEL;
  const startedAt = Date.now();
  let responseBody: unknown;
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        store: false,
        service_tier: "default",
        reasoning: { effort: "low" },
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: buildPrompt(referenceDate) },
            ...imageBuffers.map((imageBuffer, index) => ({
              type: "input_image",
              image_url: `data:${mimeTypes[index]};base64,${imageBuffer.toString("base64")}`,
              detail: "high",
            })),
          ],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "workout_proof",
            strict: true,
            schema: responseJsonSchema,
          },
        },
        max_output_tokens: 2000,
      }),
    });
    if (!response.ok) throw classifyProviderError({ status: response.status });
    responseBody = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ProofExtractionError(
        "invalid-response",
        "The photo check returned an unreadable result and needs manual review.",
        false,
      );
    }
    throw classifyProviderError(error);
  }

  const parsed = OpenAIResponseSchema.safeParse(responseBody);
  if (!parsed.success) {
    throw new ProofExtractionError(
      "invalid-response",
      "The photo check did not return a complete result and needs manual review.",
      false,
    );
  }
  const response = parsed.data;
  const text = response.output
    .flatMap((item) => item.type === "message" ? item.content.map((part) => part.text) : [])
    .join("");

  return {
    ...parseExtractionResult(text),
    metadata: {
      provider: "openai",
      model,
      modelVersion: response.model ?? null,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      durationMs: Date.now() - startedAt,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? null,
      cacheWriteTokens: response.usage?.input_tokens_details?.cache_write_tokens ?? null,
      reasoningTokens: response.usage?.output_tokens_details?.reasoning_tokens ?? null,
    },
  };
};

export const extractProofWithGemini = async (
  imageBuffer: Buffer,
  options?: ExtractionOptions,
) => extractProofWithGeminiBatch([imageBuffer], options);

export const extractProofWithGeminiBatch = async (
  imageBuffers: Buffer[],
  options: ExtractionOptions = {},
): Promise<ProofExtractionResponse> => {
  const mimeTypes = getImageMimeTypes(imageBuffers);
  const referenceDate = options.referenceDate ?? nowInZone().toJSDate();
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_EXTRACTION_MODEL;
  const startedAt = Date.now();

  let response;
  try {
    response = await getGenAI().models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(referenceDate) },
            ...imageBuffers.map((imageBuffer, index) => ({
              inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: mimeTypes[index],
              },
            })),
          ],
        },
      ],
      config: {
        httpOptions: { timeout: EXTRACTION_TIMEOUT_MS },
        responseMimeType: "application/json",
        responseJsonSchema,
        maxOutputTokens: 700,
        temperature: 0,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });
  } catch (error) {
    throw classifyProviderError(error);
  }

  return {
    ...parseExtractionResult(response.text ?? ""),
    metadata: {
      provider: "gemini",
      model,
      modelVersion: response.modelVersion ?? null,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      durationMs: Date.now() - startedAt,
      inputTokens: response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
    },
  };
};
