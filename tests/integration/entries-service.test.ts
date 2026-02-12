import { nowInZone } from "@rowbook/shared";
import { describe, expect, it } from "vitest";

import { prisma } from "../../apps/web/src/db/client.ts";
import {
  createEntry,
  deleteEntry,
  updateEntry,
} from "../../apps/web/src/server/services/entries-service.ts";
import { createUploadedProofImage, seedBasicTeam } from "../setup/db-fixtures.ts";

describe("@smoke entries-service", () => {
  it("creates, updates, and deletes an athlete entry", async () => {
    const { athleteA } = await seedBasicTeam(prisma);
    const proof = await createUploadedProofImage(prisma, athleteA.id);
    const entryDate = nowInZone().minus({ hours: 1 }).toJSDate();

    const created = await createEntry(athleteA.id, {
      activityType: "RUN",
      date: entryDate,
      minutes: 45,
      distance: 10,
      avgHr: 152,
      notes: "Steady effort",
      proofImageIds: [proof.id],
      proofOcr: null,
    });

    expect(created.entry.id).toBeTruthy();
    expect(created.entry.validationStatus).toBe("NOT_CHECKED");

    const updated = await updateEntry(athleteA.id, {
      id: created.entry.id,
      minutes: 50,
      distance: 11,
      notes: "Updated notes",
    });

    expect(updated.entry.minutes).toBe(50);
    expect(updated.entry.distance).toBe(11);
    expect(updated.entry.notes).toBe("Updated notes");

    const deleted = await deleteEntry(athleteA.id, created.entry.id);
    expect(deleted.success).toBe(true);

    const fromDb = await prisma.trainingEntry.findUnique({ where: { id: created.entry.id } });
    expect(fromDb).toBeNull();
  });

  it("rejects duplicate proof image IDs", async () => {
    const { athleteA } = await seedBasicTeam(prisma);
    const proof = await createUploadedProofImage(prisma, athleteA.id);

    await expect(
      createEntry(athleteA.id, {
        activityType: "ERG",
        date: nowInZone().minus({ minutes: 30 }).toJSDate(),
        minutes: 30,
        distance: 8,
        avgHr: 150,
        notes: null,
        proofImageIds: [proof.id, proof.id],
        proofOcr: null,
      }),
    ).rejects.toThrow("Duplicate proof images are not allowed.");
  });
});
