import assert from "node:assert/strict";
import test from "node:test";

import { getProofRetentionDeleteAfter } from "@rowbook/shared";

test("proof retention stays at 20:00 New York across spring DST", () => {
  assert.equal(
    getProofRetentionDeleteAfter(
      new Date("2026-03-02T01:00:00.000Z"),
    ).toISOString(),
    "2026-03-09T00:00:00.000Z",
  );
});

test("proof retention stays at 20:00 New York across fall DST", () => {
  assert.equal(
    getProofRetentionDeleteAfter(
      new Date("2026-10-26T00:00:00.000Z"),
    ).toISOString(),
    "2026-11-02T01:00:00.000Z",
  );
});
