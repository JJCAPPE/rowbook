import assert from "node:assert/strict";
import test from "node:test";

import {
  getEvidenceRetryDelayMs,
  MAX_EVIDENCE_EXTRACTION_ATTEMPTS,
} from "../../apps/web/src/server/repositories/evidence-extraction-jobs.ts";
import {
  MAX_PROOF_EXTRACTION_JOBS_PER_RUN,
  runProofExtraction,
} from "../../apps/web/src/server/jobs/proof-extraction.ts";

test("retry delays stay within the five-minute recovery cadence", () => {
  const firstRetry = getEvidenceRetryDelayMs(1, "job-1");
  const secondRetry = getEvidenceRetryDelayMs(2, "job-1");

  assert.ok(firstRetry >= 60_000 && firstRetry <= 72_000);
  assert.ok(secondRetry >= 120_000 && secondRetry <= 144_000);
  assert.equal(MAX_EVIDENCE_EXTRACTION_ATTEMPTS, 3);
});

test("a scheduled drain can clear a burst larger than the old daily cap", () => {
  assert.equal(MAX_PROOF_EXTRACTION_JOBS_PER_RUN, 100);
});

test("a drain stops claiming work when its claim window is exhausted", async () => {
  const result = await runProofExtraction({
    maxJobs: MAX_PROOF_EXTRACTION_JOBS_PER_RUN,
    claimWindowMs: 0,
  });

  assert.deepEqual(result, { processed: 0, results: [] });
});
