import type { ProofExtractedFields } from "@rowbook/shared";
import { nowInZone } from "@rowbook/shared";
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

// We keep this for backward compatibility if needed, but the main logic uses Gemini now.
export const extractTextFromImage = async (image: Buffer) => {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");

  try {
    const result = await worker.recognize(image);
    return result.data.text ?? "";
  } finally {
    await worker.terminate();
  }
};


// Exported for testing/mocking purposes
export let genAI: GoogleGenerativeAI | null = null;

export const setGenAI = (instance: GoogleGenerativeAI) => {
  genAI = instance;
};

type GeminiProofExtraction = {
  date: string | null;
  minutes: number | null;
  distance: number | null;
  avgHr: number | null;
  confidence: number;
  rejectionReason: string | null;
};

const getGenAI = () => {
  if (genAI) return genAI;
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is missing in environment variables!");
    throw new Error("Server configuration error: GEMINI_API_KEY is missing.");
  }

  console.log(`Initializing Gemini Client with key length: ${apiKey.length}`);
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
};

const verificationSchema: Schema = {
  description: "Extracted workout data from proof image",
  type: SchemaType.OBJECT,
  properties: {
    date: {
      type: SchemaType.STRING,
      description: "ISO 8601 date string (YYYY-MM-DD) or null if not found",
      nullable: true,
    },
    minutes: {
      type: SchemaType.NUMBER,
      description: "Total duration in minutes",
      nullable: true,
    },
    distance: {
      type: SchemaType.NUMBER,
      description: "Total distance in kilometers. Convert meters to km if needed.",
      nullable: true,
    },
    avgHr: {
      type: SchemaType.NUMBER,
      description: "Average heart rate in bpm",
      nullable: true,
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: "Confidence score between 0 and 1 indicating how likely this is a valid workout proof",
    },
    rejectionReason: {
      type: SchemaType.STRING,
      description: "If confidence is low (less than 0.8), provide a brief explanation of why this image might not be a valid workout proof.",
      nullable: true,
    },
  },
  required: ["date", "minutes", "distance", "avgHr", "confidence", "rejectionReason"],
};

export const extractProofWithGemini = async (imageBuffer: Buffer) => {
  return extractProofWithGeminiBatch([imageBuffer]);
};

const detectImageMimeType = (imageBuffer: Buffer): string => {
  if (imageBuffer.length >= 8 && imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
    return "image/png";
  }

  if (
    imageBuffer.length >= 3 &&
    imageBuffer[0] === 0xff &&
    imageBuffer[1] === 0xd8 &&
    imageBuffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    imageBuffer.length >= 12 &&
    imageBuffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    imageBuffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return "image/jpeg";
};

export const extractProofWithGeminiBatch = async (imageBuffers: Buffer[]): Promise<GeminiProofExtraction> => {
  if (imageBuffers.length === 0) {
    throw new Error("At least one proof image is required for Gemini extraction.");
  }

  const ai = getGenAI();

  const model = ai.getGenerativeModel({
    model: "gemini-3-flash-preview",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: verificationSchema,
    },
  });

  const today = nowInZone().toISODate() ?? "";
  const prompt = `
You are validating rowing workout proof images.
Current date: ${today}.
The user may provide one image or multiple related images from the same workout.

Task:
1) Review all provided images together as one evidence set.
2) Return one consolidated JSON object matching the schema.

Field rules:
- date: Workout date in YYYY-MM-DD.
  * Resolve relative dates like "today" and "yesterday" against ${today}.
  * If year is missing, infer current year unless that would make a future date.
- minutes: Total workout minutes for the full evidence set.
  * Use workout duration only (exclude recovery/rest-only clocks unless clearly part of the workout total).
- distance: Total workout distance in kilometers for the full evidence set.
  * Convert meters to kilometers.
  * Return up to 3 decimal places.
- avgHr: Average heart rate in bpm.
  * Only use heart-rate values (bpm). Never use stroke rate (s/m) or cadence/rpm.
- confidence: 0.0 to 1.0 confidence that the evidence set is legitimate workout proof.
- rejectionReason: Required when confidence < 0.8, otherwise null.

Consistency and de-duplication:
- If multiple images show the same workout metric, do not double-count.
- If images contain complementary metrics (e.g., one shows time and another shows distance), combine them.
- Prefer clearly labeled totals over ambiguous partial splits.
`;

  const imageParts = imageBuffers.map((imageBuffer) => ({
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType: detectImageMimeType(imageBuffer),
    },
  }));

  let result;
  try {
    result = await model.generateContent([prompt, ...imageParts]);
  } catch (e: any) {
    console.error("Gemini API Error during generateContent:", e);
    const hasKey = !!process.env.GEMINI_API_KEY;
    const keyLen = process.env.GEMINI_API_KEY?.length;
    throw new Error(`Gemini API Error: ${e.message}. Key Present: ${hasKey} (Len: ${keyLen})`);
  }

  const text = result.response.text();
  console.log("AI extraction result:", text);
  try {
    return JSON.parse(text) as GeminiProofExtraction;
  } catch (e: any) {
    console.error("Failed to parse Gemini response:", text);
    const hasKey = !!process.env.GEMINI_API_KEY;
    const keyLen = process.env.GEMINI_API_KEY?.length;

    if (e.message?.includes("403") || e.toString().includes("403")) {
       throw new Error(`Gemini API 403 Forbidden. Env Key Present: ${hasKey}, Length: ${keyLen}. Details: ${e.message}`);
    }
    throw new Error(`Invalid response from Gemini. Key Present: ${hasKey} (Len: ${keyLen})`);
  }
};
