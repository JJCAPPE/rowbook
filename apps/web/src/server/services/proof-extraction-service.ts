import { extractProofFieldsFromText } from "@rowbook/shared";

export { extractProofFieldsFromText };

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
