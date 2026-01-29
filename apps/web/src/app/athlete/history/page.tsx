"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ACTIVITY_TYPE_LABELS } from "@rowbook/shared";
import type { ActivityType } from "@rowbook/shared";
import { Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ActivityIcon } from "@/components/ui/activity-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProofExtractionFeedback } from "@/components/ui/proof-extraction-feedback";
import { WeeklyStatusBadge } from "@/components/ui/weekly-status-badge";
import { formatFullDate, formatMinutes, formatWeekRange, formatPaceWithUnit, formatWatts } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { getWeekKey } from "@/lib/week-options";

type HistoryFilter = "ALL" | ActivityType | "HR_PRESENT" | "MIN_30";

export default function AthleteHistoryPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.athlete.getHistoryWithEntries.useQuery();
  const history = useMemo(() => data ?? [], [data]);
  const [activeFilter, setActiveFilter] = useState<HistoryFilter>("ALL");
  const { mutateAsync: deleteEntry, isLoading: isDeleting } =
    trpc.athlete.deleteEntry.useMutation({
      onSuccess: async () => {
        await utils.athlete.getDashboard.invalidate();
        await utils.athlete.getHistory.invalidate();
        await utils.athlete.getHistoryWithEntries.invalidate();
        await utils.athlete.getWeekDetail.invalidate();
        await utils.athlete.getLeaderboard.invalidate();
      },
    });

  const filteredHistory = useMemo(
    () =>
      history.flatMap((week) => {
        if (activeFilter === "MIN_30" && week.totalMinutes < 30) {
          return [];
        }

        if (activeFilter === "HR_PRESENT" && !week.hasHrData) {
          return [];
        }

        if (
          activeFilter !== "ALL" &&
          activeFilter !== "MIN_30" &&
          activeFilter !== "HR_PRESENT" &&
          !week.activityTypes.includes(activeFilter)
        ) {
          return [];
        }

        const entries =
          activeFilter === "ALL" || activeFilter === "MIN_30"
            ? week.entries
            : activeFilter === "HR_PRESENT"
              ? week.entries.filter((entry) => entry.avgHr !== null && entry.avgHr !== undefined)
              : week.entries.filter((entry) => entry.activityType === activeFilter);

        if (!entries.length) {
          return [];
        }

        return [
          {
            ...week,
            entries,
          },
        ];
      }),
    [activeFilter, history],
  );

  const handleDelete = async (entryId: string) => {
    const confirmed = window.confirm("Remove this entry? This cannot be undone.");
    if (!confirmed) {
      return;
    }
    await deleteEntry({ id: entryId });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly history"
        subtitle="Review totals, proof status, and weekly requirements."
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip isActive={activeFilter === "ALL"} onClick={() => setActiveFilter("ALL")}>
          All
        </FilterChip>
        <FilterChip isActive={activeFilter === "ERG"} onClick={() => setActiveFilter("ERG")}>
          Erg
        </FilterChip>
        <FilterChip isActive={activeFilter === "RUN"} onClick={() => setActiveFilter("RUN")}>
          Run
        </FilterChip>
        <FilterChip
          isActive={activeFilter === "HR_PRESENT"}
          onClick={() => setActiveFilter("HR_PRESENT")}
        >
          HR present
        </FilterChip>
        <FilterChip isActive={activeFilter === "MIN_30"} onClick={() => setActiveFilter("MIN_30")}>
          Min 30
        </FilterChip>
      </div>

      <div className="grid gap-6">
        {isLoading ? (
          <Card className="text-sm text-default-500">Loading weekly history...</Card>
        ) : error ? (
          <Card className="text-sm text-rose-500">Unable to load history.</Card>
        ) : filteredHistory.length > 0 ? (
          filteredHistory.map((week) => {
            const weekKey = getWeekKey(week.weekStartAt);
            return (
              <Card key={weekKey} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider/40 pb-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {formatWeekRange(week.weekStartAt, week.weekEndAt)}
                    </p>
                    <p className="text-xs text-default-500">
                      {week.totalMinutes} total minutes
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <WeeklyStatusBadge status={week.status} />
                    <Link
                      className="text-sm font-semibold text-primary"
                      href={`/athlete?weekStartAt=${encodeURIComponent(weekKey)}`}
                    >
                      View week
                    </Link>
                  </div>
                </div>
                <div className="grid gap-2">
                  {week.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-divider/40 bg-content2/70 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full border border-divider/40 bg-content2/70 p-2">
                            <ActivityIcon type={entry.activityType} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {formatMinutes(entry.minutes)}{" "}
                              {ACTIVITY_TYPE_LABELS[entry.activityType]}
                            </p>
                            <p className="text-xs text-default-500">
                              {formatFullDate(entry.date)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={entry.validationStatus} />
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            aria-label="Delete entry"
                            className="h-8 w-8 min-w-0 text-default-500"
                            disabled={isDeleting}
                            onClick={() => handleDelete(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {/* Pace and watts row */}
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-500">
                        {entry.avgPace != null && (
                          <span>Pace: {formatPaceWithUnit(entry.activityType, entry.avgPace)}</span>
                        )}
                        {(entry.activityType === "ERG" || entry.activityType === "CYCLE") && entry.avgWatts != null && (
                          <span>Watts: {formatWatts(entry.avgWatts)}</span>
                        )}
                        {entry.avgHr != null && (
                          <span>HR: {entry.avgHr} bpm</span>
                        )}
                      </div>
                      {entry.validationStatus === "REJECTED" && entry.rejectionNote && (
                        <div className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                          <span className="font-semibold text-rose-600">Rejection reason:</span> {entry.rejectionNote}
                        </div>
                      )}
                      {(entry as any).extractedFields && (
                        <details className="mt-2 text-[10px] text-default-500">
                          <summary className="cursor-pointer select-none hover:text-foreground">
                            View details from Gemini extraction
                          </summary>
                          <ProofExtractionFeedback fields={(entry as any).extractedFields} />
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="text-sm text-default-500">
            {history.length > 0 ? "No weeks match this filter yet." : "No weekly history yet."}
          </Card>
        )}
      </div>
    </div>
  );
}
