import React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUploadUrlSpy: vi.fn(),
  confirmUploadSpy: vi.fn(),
  extractFromProofSpy: vi.fn(),
  createEntrySpy: vi.fn(),
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
    proof: {
      createUploadUrl: {
        useMutation: () => ({ mutateAsync: mocks.createUploadUrlSpy }),
      },
      confirmUpload: {
        useMutation: () => ({ mutateAsync: mocks.confirmUploadSpy }),
      },
      extractFromProof: {
        useMutation: () => ({ mutateAsync: mocks.extractFromProofSpy }),
      },
    },
    athlete: {
      createEntry: {
        useMutation: () => ({ mutateAsync: mocks.createEntrySpy }),
      },
    },
  },
}));

import { LogWorkoutForm } from "@/components/forms/log-workout-form.tsx";
import { renderWithUi } from "./test-utils";

class MockXMLHttpRequest {
  upload = {
    addEventListener: (event: string, callback: (payload: ProgressEvent) => void) => {
      if (event === "progress") {
        this.progressListener = callback;
      }
    },
  };

  status = 200;
  private progressListener?: (payload: ProgressEvent) => void;
  private listeners: Record<string, () => void> = {};

  open() {}
  setRequestHeader() {}

  addEventListener(event: string, callback: () => void) {
    this.listeners[event] = callback;
  }

  send() {
    this.progressListener?.({
      lengthComputable: true,
      loaded: 1,
      total: 1,
    } as ProgressEvent);
    this.listeners.load?.();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LogWorkoutForm", () => {
  it("shows an error when submitting without uploaded proof", async () => {
    const user = userEvent.setup();

    renderWithUi(<LogWorkoutForm />);

    await user.clear(screen.getByLabelText("Minutes"));
    await user.type(screen.getByLabelText("Minutes"), "30");
    await user.clear(screen.getByLabelText("Distance (km)"));
    await user.type(screen.getByLabelText("Distance (km)"), "5");

    await user.click(screen.getByRole("button", { name: "Submit workout" }));

    expect(await screen.findByText("At least one proof image is required")).toBeInTheDocument();
  });

  it("uploads proof, extracts data and submits entry", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubGlobal("XMLHttpRequest", MockXMLHttpRequest as unknown as typeof XMLHttpRequest);

    mocks.createUploadUrlSpy.mockResolvedValueOnce({
      proofImageId: "proof-1",
      uploadUrl: "https://upload.example.local",
      storagePath: "athlete/proof-1.png",
      expiresAt: new Date("2026-02-07T00:00:00.000Z"),
    });
    mocks.confirmUploadSpy.mockResolvedValueOnce({});
    mocks.extractFromProofSpy.mockResolvedValueOnce({
      date: "2026-02-07",
      minutes: 45,
      distance: 10,
      avgHr: 152,
    });
    mocks.createEntrySpy.mockResolvedValueOnce({});

    const { container } = renderWithUi(<LogWorkoutForm />);

    const fileInput = container.querySelector<HTMLInputElement>("#proof");
    expect(fileInput).toBeTruthy();

    const file = new File(["proof-data"], "proof.png", { type: "image/png" });
    await user.upload(fileInput!, file);

    await waitFor(() => {
      expect(mocks.createUploadUrlSpy).toHaveBeenCalledTimes(1);
      expect(mocks.confirmUploadSpy).toHaveBeenCalledWith({ proofImageId: "proof-1" });
      expect(mocks.extractFromProofSpy).toHaveBeenCalledWith({ proofImageId: "proof-1" });
    });
    expect(await screen.findByAltText("Proof preview 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit workout" }));

    await waitFor(() => {
      expect(mocks.createEntrySpy).toHaveBeenCalledTimes(1);
    });

    expect(mocks.createEntrySpy.mock.calls[0]?.[0]).toMatchObject({
      proofImageIds: ["proof-1"],
      minutes: 45,
      distance: 10,
      avgHr: 152,
    });

    await waitFor(() => {
      expect(mocks.invalidateSpy).toHaveBeenCalled();
    });
  });
});
