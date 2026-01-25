import { cleanupExpiredProofImages } from "@/server/services/proof-service";

export const runProofCleanup = async () => cleanupExpiredProofImages();
