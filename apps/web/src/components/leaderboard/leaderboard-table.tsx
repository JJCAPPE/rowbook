"use client";

import { useMemo, useState } from "react";
import { ActivityType, WeeklyStatus } from "@rowbook/shared";

import { ActivityIcon } from "@/components/ui/activity-icon";
import { FilterChip } from "@/components/ui/filter-chip";
import { WeeklyStatusBadge } from "@/components/ui/weekly-status-badge";
import { cn } from "@/lib/utils";

type LeaderboardRow = {
  id: string;
  name: string;
  totalMinutes: number;
  status: WeeklyStatus;
  activityTypes: ActivityType[];
  hasHr: boolean;
  missingProof?: boolean;
  missingMinutes?: boolean;
};

type LeaderboardTableProps = {
  rows: LeaderboardRow[];
  showFilters?: boolean;
};

const statusStyles: Record<WeeklyStatus, string> = {
  MET: "border-emerald-500/30 bg-emerald-500/10",
  NOT_MET: "border-rose-500/30 bg-rose-500/10",
  EXEMPT: "border-divider/40 bg-content1/60",
};

export const LeaderboardTable = ({ rows, showFilters = true }: LeaderboardTableProps) => {
  const [showExempt, setShowExempt] = useState(true);

  const visibleRows = useMemo(
    () => (showExempt ? rows : rows.filter((row) => row.status !== "EXEMPT")),
    [rows, showExempt],
  );

  return (
    <div className="space-y-4">
      {showFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip isActive={showExempt} onClick={() => setShowExempt((prev) => !prev)}>
            {showExempt ? "Hide exempt" : "Show exempt"}
          </FilterChip>
          <FilterChip>Missing proof</FilterChip>
          <FilterChip>Missing minutes</FilterChip>
        </div>
      ) : null}

      <div className="grid gap-3">
        {visibleRows.map((row, index) => (
          <div
            key={row.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-4 py-3",
              statusStyles[row.status],
            )}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-default-500">#{index + 1}</span>
              <div>
                <p className="text-sm font-semibold text-foreground">{row.name}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-default-500">
                  <span>{row.totalMinutes} min</span>
                  <span>•</span>
                  <span>{row.hasHr ? "HR logged" : "No HR data"}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 rounded-full border border-divider/40 bg-content2/70 px-2 py-1">
                {row.activityTypes.map((type) => (
                  <ActivityIcon key={`${row.id}-${type}`} type={type} />
                ))}
              </div>
              <WeeklyStatusBadge status={row.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
