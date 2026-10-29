import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Prisma, type TrainingEntry } from "@prisma/client";
import type { TRPCError } from "@trpc/server";
import { MAX_PROOF_FILES, nowInZone } from "@rowbook/shared";

import { prisma } from "../../apps/web/src/db/client.ts";
import { createEntry } from "../../apps/web/src/server/services/entries-service.ts";

process.env.ROWBOOK_DISABLE_BACKGROUND_JOBS = "1";

const athleteId = "athlete-save-test";
const input = () => ({
  clientSubmissionId: "5fd637cc-d688-4fa0-b94d-39a7577bb493",
  activityType: "ERG" as const,
  date: nowInZone().startOf("day").toJSDate(),
  minutes: 30,
  distance: 6,
  proofImageIds: ["proof-1"],
});

const mockStore = (t: TestContext) => {
  const state = {
    saved: null as TrainingEntry | null,
    proofs: [{
      id: "proof-1",
      athleteId,
      clientSubmissionId: input().clientSubmissionId,
      uploadedAt: new Date() as Date | null,
      verifiedSize: 100,
      verifiedMimeType: "image/jpeg",
      contentSha256: "proof-content-hash",
      deletedAt: null,
      attachedAt: null,
      trainingEntryId: null,
      deleteAfter: new Date(Date.now() + 86_400_000),
    }],
    legacyReferences: 0,
    previouslyAttached: null as { id: string } | null,
    attachedCount: 1,
    writes: 0,
    transactionError: null as Error | null,
    loseCommitAcknowledgement: false,
  };
  const tx = {
    trainingEntry: {
      count: async () => state.legacyReferences,
      create: async ({ data }: { data: object }) => {
        state.writes += 1;
        state.saved = { id: "entry-1", ...data } as TrainingEntry;
        return state.saved;
      },
    },
    proofImage: {
      findMany: async () => state.proofs,
      findFirst: async () => state.previouslyAttached,
      updateMany: async () => ({ count: state.attachedCount }),
    },
    evidenceExtractionJob: { create: async () => ({ id: "job-1" }) },
    auditLog: { create: async () => ({ id: "audit-1" }) },
  };
  const findUnique = prisma.trainingEntry.findUnique;
  prisma.trainingEntry.findUnique = (async () => state.saved) as typeof findUnique;
  t.after(() => {
    prisma.trainingEntry.findUnique = findUnique;
  });
  t.mock.method(prisma, "$transaction", async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => {
    if (state.transactionError) throw state.transactionError;
    let result;
    try {
      result = await callback(tx as unknown as Prisma.TransactionClient);
    } catch (error) {
      state.saved = null;
      throw error;
    }
    if (state.loseCommitAcknowledgement) throw new Error("connection lost after commit");
    return result;
  });
  return state;
};

const rejectsWith = (code: TRPCError["code"], message: RegExp) => (error: unknown) => {
  assert.ok(error instanceof Error);
  assert.equal(error.name, "TRPCError", "Expected a typed rejection so the form can recover.");
  assert.ok("code" in error);
  assert.equal(error.code, code);
  assert.match(error.message, message);
  return true;
};

test("invalid workout details produce actionable rejections, not an ambiguous save", async (t) => {
  const cases: Array<[string, Partial<ReturnType<typeof input>>, RegExp]> = [
    ["missing proof", { proofImageIds: [] }, /proof image is required/],
    ["too many proofs", { proofImageIds: Array.from({ length: MAX_PROOF_FILES + 1 }, (_, i) => `proof-${i}`) }, /at most/],
    ["duplicate proof", { proofImageIds: ["proof-1", "proof-1"] }, /Duplicate proof/],
    ["old workout", { date: nowInZone().minus({ days: 8 }).toJSDate() }, /last 7 days/],
    ["future workout", { date: nowInZone().plus({ days: 1 }).toJSDate() }, /future/],
  ];
  for (const [name, overrides, message] of cases) {
    await t.test(name, async (child) => {
      mockStore(child);
      await assert.rejects(
        createEntry(athleteId, { ...input(), ...overrides }),
        rejectsWith("BAD_REQUEST", message),
      );
    });
  }
});

test("proof rejections remain actionable after the transaction rolls back", async (t) => {
  for (const scenario of ["expired", "missing", "unconfirmed", "used", "legacy", "raced"] as const) {
    await t.test(scenario, async (child) => {
      const state = mockStore(child);
      if (scenario === "expired") state.proofs[0].deleteAfter = new Date(0);
      if (scenario === "missing") state.proofs = [];
      if (scenario === "unconfirmed") state.proofs[0].uploadedAt = null;
      if (scenario === "used") state.previouslyAttached = { id: "old-proof" };
      if (scenario === "legacy") state.legacyReferences = 1;
      if (scenario === "raced") state.attachedCount = 0;
      await assert.rejects(createEntry(athleteId, input()), rejectsWith("BAD_REQUEST", /proof/i));
      assert.equal(state.saved, null);
    });
  }
});

test("replaying a saved workout returns its acknowledgement without a second write", async (t) => {
  const state = mockStore(t);
  const values = input();
  const first = await createEntry(athleteId, values);
  const replay = await createEntry(athleteId, values);
  assert.equal(replay.entry.id, first.entry.id);
  assert.equal(replay.idempotent, true);
  assert.equal(state.writes, 1);
  await assert.rejects(createEntry(athleteId, { ...values, minutes: 31 }), rejectsWith("CONFLICT", /different values/));
  assert.equal(state.writes, 1);
});

test("a lost commit acknowledgement recovers the saved workout", async (t) => {
  const state = mockStore(t);
  state.loseCommitAcknowledgement = true;
  const result = await createEntry(athleteId, input());
  assert.equal(result.entry.id, "entry-1");
  assert.equal(result.idempotent, true);
  assert.equal(state.writes, 1);
});

test("unexpected database failures are not mislabeled as a safe rejection", async (t) => {
  const state = mockStore(t);
  state.transactionError = new Error("database connection lost");
  await assert.rejects(createEntry(athleteId, input()), (error) => error === state.transactionError);
  assert.equal(state.writes, 0);
});
