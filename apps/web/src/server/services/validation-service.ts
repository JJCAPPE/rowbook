import { ValidationStatus } from "@rowbook/shared";
import { getTrainingEntryById, updateTrainingEntry } from "@/server/repositories/training-entries";
import { updateProofImage } from "@/server/repositories/proof-images";
import { createAuditLog } from "@/server/repositories/audit-logs";

export const overrideValidationStatus = async (
  actorId: string,
  entryId: string,
  status: ValidationStatus,
) => {
  const entry = await getTrainingEntryById(entryId);
  if (!entry) {
    throw new Error("Entry not found.");
  }

  const updated = await updateTrainingEntry(entryId, {
    validationStatus: status,
  });

  await updateProofImage(entry.proofImageId, {
    validationStatus: status,
    reviewedById: actorId,
  });

  await createAuditLog({
    actorId,
    entityType: "TRAINING_ENTRY",
    entityId: entryId,
    action: "OVERRIDE_VALIDATION",
    before: entry,
    after: updated,
  });

  return updated;
};
