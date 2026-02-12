import React from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveRequirementsSpy: vi.fn(),
  invalidateSpy: vi.fn(),
  weeklyRequirements: [] as Array<{ weekStartAt: Date; requiredMinutes: number }>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      coach: {
        getWeeklyRequirementsRange: { invalidate: mocks.invalidateSpy },
        getWeeklySettings: { invalidate: mocks.invalidateSpy },
        getTeamOverview: { invalidate: mocks.invalidateSpy },
      },
    }),
    coach: {
      getWeeklyRequirementsRange: {
        useQuery: () => ({
          data: mocks.weeklyRequirements,
          isLoading: false,
        }),
      },
      setWeeklyRequirements: {
        useMutation: (options?: { onSuccess?: () => void }) => ({
          mutateAsync: async (...args: unknown[]) => {
            mocks.saveRequirementsSpy(...args);
            options?.onSuccess?.();
          },
          isLoading: false,
        }),
      },
    },
  },
}));

import { WeeklyTargetsTable } from "@/components/coach/weekly-targets-table.tsx";
import { renderWithUi } from "./test-utils";

describe("WeeklyTargetsTable", () => {
  it("tracks dirty state and saves requirements", async () => {
    const user = userEvent.setup();
    renderWithUi(<WeeklyTargetsTable teamId="team-1" />);

    const saveButton = await screen.findByRole("button", { name: "Save Changes" });
    expect(saveButton).toBeDisabled();

    const inputs = await screen.findAllByRole("spinbutton");
    expect(inputs.length).toBeGreaterThanOrEqual(6);

    await user.clear(inputs[0]!);
    await user.type(inputs[0]!, "120");

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });

    await user.click(saveButton);

    expect(mocks.saveRequirementsSpy).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateSpy).toHaveBeenCalled();
  });
});
