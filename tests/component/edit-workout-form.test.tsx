import React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateEntrySpy: vi.fn(),
  invalidateSpy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      athlete: {
        getDashboard: { invalidate: mocks.invalidateSpy },
        getHistory: { invalidate: mocks.invalidateSpy },
        getHistoryWithEntries: { invalidate: mocks.invalidateSpy },
        getWeekDetail: { invalidate: mocks.invalidateSpy },
        getLeaderboard: { invalidate: mocks.invalidateSpy },
      },
      coach: {
        getReviewQueue: { invalidate: mocks.invalidateSpy },
        getTeamOverview: { invalidate: mocks.invalidateSpy },
      },
    }),
    athlete: {
      updateEntry: {
        useMutation: () => ({
          mutateAsync: mocks.updateEntrySpy,
        }),
      },
    },
  },
}));

import { EditWorkoutForm } from "@/components/forms/edit-workout-form.tsx";
import { renderWithUi } from "./test-utils";

const entry = {
  id: "entry-1",
  athleteId: "athlete-1",
  activityType: "RUN" as const,
  date: new Date("2026-02-07T17:00:00.000Z"),
  minutes: 45,
  distance: 10,
  avgHr: 152,
  notes: "Original note",
  avgPace: null,
  avgWatts: null,
  validationStatus: "PENDING" as const,
  entryStatus: "ACTIVE" as const,
  weekStartAt: new Date("2026-02-01T01:00:00.000Z"),
  lockedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("EditWorkoutForm", () => {
  it("submits updated payload and invalidates dependent queries", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();

    mocks.updateEntrySpy.mockResolvedValueOnce({});

    renderWithUi(<EditWorkoutForm entry={entry} onSuccess={onSuccess} onCancel={vi.fn()} />);

    const notesInput = screen.getByLabelText("Notes");
    await user.clear(notesInput);
    await user.type(notesInput, "  updated note  ");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mocks.updateEntrySpy).toHaveBeenCalledTimes(1);
    });

    expect(mocks.updateEntrySpy.mock.calls[0]?.[0]).toMatchObject({
      id: "entry-1",
      activityType: "RUN",
      minutes: 45,
      distance: 10,
      avgHr: 152,
      notes: "updated note",
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateSpy).toHaveBeenCalled();
  });

  it("shows mutation errors", async () => {
    const user = userEvent.setup();
    mocks.updateEntrySpy.mockRejectedValueOnce(new Error("Unable to update entry."));

    renderWithUi(<EditWorkoutForm entry={entry} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Unable to update entry.")).toBeInTheDocument();
  });
});
