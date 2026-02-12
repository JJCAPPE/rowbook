import React from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table.tsx";
import { renderWithUi } from "./test-utils";

const rows = [
  {
    id: "a",
    name: "Athlete A",
    totalMinutes: 120,
    status: "MET" as const,
    activityTypes: ["ERG" as const],
    hasHr: true,
    pendingProof: false,
    missingMinutes: false,
    totalDistance: 20,
    avgHr: 150,
    previousWeekMinutes: 100,
  },
  {
    id: "b",
    name: "Athlete B",
    totalMinutes: 60,
    status: "EXEMPT" as const,
    activityTypes: ["RUN" as const],
    hasHr: false,
    pendingProof: true,
    missingMinutes: false,
    totalDistance: 8,
    avgHr: null,
    previousWeekMinutes: 80,
  },
  {
    id: "c",
    name: "Athlete C",
    totalMinutes: 40,
    status: "NOT_MET" as const,
    activityTypes: ["RUN" as const],
    hasHr: false,
    pendingProof: false,
    missingMinutes: true,
    totalDistance: 6,
    avgHr: null,
    previousWeekMinutes: 70,
  },
];

describe("LeaderboardTable", () => {
  it("toggles exempt visibility and review filters", async () => {
    const user = userEvent.setup();
    renderWithUi(<LeaderboardTable rows={rows} />);

    expect(screen.getByText("Athlete A")).toBeInTheDocument();
    expect(screen.getByText("Athlete B")).toBeInTheDocument();
    expect(screen.getByText("Athlete C")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide exempt" }));
    expect(screen.queryByText("Athlete B")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pending review" }));
    expect(screen.queryByText("Athlete A")).not.toBeInTheDocument();
    expect(screen.queryByText("Athlete C")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pending review" }));
    await user.click(screen.getByRole("button", { name: "Missing minutes" }));
    expect(screen.getByText("Athlete C")).toBeInTheDocument();
    expect(screen.queryByText("Athlete A")).not.toBeInTheDocument();
  });
});
