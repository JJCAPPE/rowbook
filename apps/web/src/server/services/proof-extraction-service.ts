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
  const ai = getGenAI();

  const model = ai.getGenerativeModel({
    model: "gemini-flash-lite-latest",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: verificationSchema,
    },
  });

  const today = nowInZone().toISODate() ?? "";
  const prompt = `
    Analyze this image and extract workout proof data.
    Current date is ${today}.
    - Date: Look for a date or relative date (e.g., "today", "yesterday"). Convert to ISO 8601 (YYYY-MM-DD). 
      If "yesterday", use the date before ${today}.
      If "today", use ${today}.
      If year is missing, assume the current year, but ensure the resulting date is not in the future.
    - Minutes: Total duration of the workout in minutes. Beware of some screens showing Total time inclusing resting time.
    - Distance: Total distance covered in KILOMETERS. If the value is in meters, divide by 1000. To three decimal places (eg 12.124)
    - AvgHr: Average heart rate in beats per minute (bpm). Beware of not selecting stroke rate instead. Heart rate ranges typically are above 100 bpm. Make sure is says bpm and not rpm or s/m.
    - Confidence: A score (0.0 to 1.0) indicating if this image looks like a legitimate workout screen (e.g. Concept2 PM5, Apple Watch, Strava, etc.). Low confidence if it's a random image.
    - RejectionReason: If confidence is low, explain why. For example: "Image is too blurry", "Image is of a landscape, not a workout", "No workout data visible".
  `;

  let result;
  try {
    result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType: "image/jpeg",
        },
      },
    ]);
  } catch (e: any) {
    console.error("Gemini API Error during generateContent:", e);
    const hasKey = !!process.env.GEMINI_API_KEY;
    const keyLen = process.env.GEMINI_API_KEY?.length;
    throw new Error(`Gemini API Error: ${e.message}. Key Present: ${hasKey} (Len: ${keyLen})`);
  }

  const text = result.response.text();
  console.log("AI extraction result:", text);
  try {
    return JSON.parse(text) as {
      date: string | null;
      minutes: number | null;
      distance: number | null;
      avgHr: number | null;
      confidence: number;
      rejectionReason: string | null;
    };
    console.error("Failed to parse Gemini response:", text);
    throw new Error("Invalid response from Gemini");
  } catch (e: any) {
    // Check for 403 or other API errors that might be thrown by the library
    console.error("Gemini API Error:", e);
    const hasKey = !!process.env.GEMINI_API_KEY;
    const keyLen = process.env.GEMINI_API_KEY?.length;
    
    if (e.message?.includes("403") || e.toString().includes("403")) {
       throw new Error(`Gemini API 403 Forbidden. Env Key Present: ${hasKey}, Length: ${keyLen}. Details: ${e.message}`);
    }
    throw e;
  }
};
