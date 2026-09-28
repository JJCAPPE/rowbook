import assert from "node:assert/strict";
import test from "node:test";
import { isWorkoutCredited, ValidationStatusValues } from "@rowbook/shared";

test("historical credit policy is preserved and newer policies require verification", () => {
  for (const validationStatus of ValidationStatusValues) {
    assert.equal(
      isWorkoutCredited({ validationStatus, creditPolicyVersion: 1 }),
      validationStatus !== "REJECTED",
    );
    for (const creditPolicyVersion of [2, 3]) {
      assert.equal(
        isWorkoutCredited({ validationStatus, creditPolicyVersion }),
        validationStatus === "VERIFIED",
      );
    }
  }
});
