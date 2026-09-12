import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PROOF_FILES,
  TrainingEntryInputSchema,
  nowInZone,
} from "@rowbook/shared";

const validEntry = {
  clientSubmissionId: "5fd637cc-d688-4fa0-b94d-39a7577bb493",
  activityType: "ERG" as const,
  date: nowInZone().toISODate(),
  minutes: 30,
  distance: 7.5,
  notes: null,
};

test("workout input accepts no more than six proof images", () => {
  const accepted = TrainingEntryInputSchema.safeParse({
    ...validEntry,
    proofImageIds: Array.from({ length: MAX_PROOF_FILES }, (_, index) => `proof-${index}`),
  });
  assert.equal(accepted.success, true);

  const rejected = TrainingEntryInputSchema.safeParse({
    ...validEntry,
    proofImageIds: Array.from(
      { length: MAX_PROOF_FILES + 1 },
      (_, index) => `proof-${index}`,
    ),
  });
  assert.equal(rejected.success, false);
});
