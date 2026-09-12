import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import {
  EvidenceExtractionResultSchema,
  nowInZone,
  toZonedDateTime,
  type EvidenceExtractionResult,
} from "@rowbook/shared";
import { z } from "zod";

export const EXTRACTION_PROVIDER = "gemini";
export const EXTRACTION_PROMPT_VERSION = "workout-proof-v2";
export const EXTRACTION_SCHEMA_VERSION = "evidence-v2";
export const DEFAULT_EXTRACTION_MODEL = "gemini-3.8-flash";
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
    confidence: { type: "number", minimum: 0, maximum: 1 },
    isSingleWorkout: {
      type: "boolean",
      description: "Whether all images can safely be treated as evidence for one workout.",
    },
    reviewReason: {
      anyOf: [{ type: "string", minLength: 1, maxLength: 500 }, { type: "null" }],
      description: "Concise uncertainty or conflict requiring human review, otherwise null.",
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
  provider: typeof EXTRACTION_PROVIDER;
  model: string;
  modelVersion: string | null;
  promptVersion: typeof EXTRACTION_PROMPT_VERSION;
  schemaVersion: typeof EXTRACTION_SCHEMA_VERSION;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
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
- date: the workout date, YYYY-MM-DD. Resolve today/yesterday against ${dateContext}. If a year is omitted, choose the most recent non-future occurrence.
- durationSeconds: ACTIVE WORK only. On Concept2 PM5 interval summaries, use the main work row or sum work intervals and exclude programmed rest. For example, 2×30:00/1:00r is 3600 active seconds even when Total Time is 1:02:00; 3×30:00/1:00r is 5400 seconds even when Total Time is 1:33:00.
- elapsedSeconds: the separate total/elapsed value including rests when visible; otherwise null.
- distanceKm: the main workout distance converted from meters/miles to kilometers. Do not sum split rows below a total row.
- avgHr: only a clearly labeled average heart rate. Prefer a Garmin/Strava average HR over PM5 cadence, stroke rate, rpm, max HR, or recovery values.
- activityType: Concept2 RowErg is ERG; Concept2 BikeErg/cycling is CYCLE; normalize other visible activities to RUN, SWIM, or OTHER.
- isSingleWorkout: false if the images plausibly show separate sessions rather than the same/complementary session.
- reviewReason: null when evidence is readable and internally consistent; otherwise one plain-language sentence.
- confidence: confidence in the consolidated values, not image authenticity.

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
  if (candidate.name === "AbortError" || /timeout/i.test(candidate.message ?? "")) {
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

export const extractProofWithGemini = async (
  imageBuffer: Buffer,
  options?: { referenceDate?: Date; model?: string },
) => extractProofWithGeminiBatch([imageBuffer], options);

export const extractProofWithGeminiBatch = async (
  imageBuffers: Buffer[],
  options: { referenceDate?: Date; model?: string } = {},
): Promise<ProofExtractionResponse> => {
  if (imageBuffers.length === 0) {
    throw new ProofExtractionError(
      "invalid-image",
      "At least one workout photo is required.",
      false,
    );
  }

  const mimeTypes = imageBuffers.map(detectImageMimeType);
  const referenceDate = options.referenceDate ?? nowInZone().toJSDate();
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_EXTRACTION_MODEL;
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

  const durationMs = Date.now() - startedAt;
  let raw: unknown;
  try {
    raw = JSON.parse(response.text ?? "");
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

  const normalized = EvidenceExtractionResultSchema.parse({
    activityType: parsed.data.activityType,
    date: parsed.data.date,
    durationSeconds: parsed.data.durationSeconds,
    elapsedSeconds: parsed.data.elapsedSeconds,
    minutes:
      parsed.data.durationSeconds === null
        ? null
        : Math.max(1, Math.round(parsed.data.durationSeconds / 60)),
    distance: parsed.data.distanceKm,
    avgHr: parsed.data.avgHr,
    confidence: parsed.data.confidence,
    isSingleWorkout: parsed.data.isSingleWorkout,
    reviewReason: parsed.data.reviewReason,
    sourceTypes: [...new Set(parsed.data.sourceTypes)],
  });

  return {
    ...normalized,
    metadata: {
      provider: EXTRACTION_PROVIDER,
      model,
      modelVersion: response.modelVersion ?? null,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      durationMs,
      inputTokens: response.usageMetadata?.promptTokenCount ?? null,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
    },
  };
};
