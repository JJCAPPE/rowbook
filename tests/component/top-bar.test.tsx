import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  replaceSpy: vi.fn(),
  refreshSpy: vi.fn(),
  logoutSpy: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replaceSpy,
    refresh: mocks.refreshSpy,
    push: vi.fn(),
  }),
  usePathname: () => "/coach",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      logout: {
        useMutation: (options?: { onSuccess?: () => void }) => ({
          mutate: () => {
            mocks.logoutSpy();
            options?.onSuccess?.();
          },
          isLoading: false,
        }),
      },
    },
  },
}));

import { TopBar } from "@/components/layout/top-bar.tsx";
import { renderWithUi } from "./test-utils";

describe("TopBar", () => {
  it("opens user menu and logs out", async () => {
    const user = userEvent.setup();

    renderWithUi(
      <TopBar
        title="Coach"
        userName="Coach Tester"
        weekOptions={[{ key: "week-1", label: "Week 1" }]}
        activeWeekKey="week-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open user menu" }));
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(mocks.logoutSpy).toHaveBeenCalledTimes(1);
    expect(mocks.replaceSpy).toHaveBeenCalledWith("/login");
    expect(mocks.refreshSpy).toHaveBeenCalledTimes(1);
  });
});
