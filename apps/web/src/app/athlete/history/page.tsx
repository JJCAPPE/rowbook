"use client";

import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { WeeklyStatusBadge } from "@/components/ui/weekly-status-badge";
import { formatWeekRange } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { getWeekKey } from "@/lib/week-options";
import type { WeeklyAggregate } from "@rowbook/shared";

export default function AthleteHistoryPage() {
  const { data, isLoading, error } = trpc.athlete.getHistory.useQuery();
  const history: WeeklyAggregate[] = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly history"
        subtitle="Review totals, proof status, and weekly requirements."
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip isActive>All</FilterChip>
        <FilterChip>Erg</FilterChip>
        <FilterChip>Run</FilterChip>
        <FilterChip>HR present</FilterChip>
        <FilterChip>Min 30</FilterChip>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <Card className="text-sm text-slate-500">Loading weekly history...</Card>
        ) : error ? (
          <Card className="text-sm text-rose-500">Unable to load history.</Card>
        ) : history.length > 0 ? (
          history.map((week) => {
            const weekKey = getWeekKey(week.weekStartAt);
            return (
              <Card key={weekKey} className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {formatWeekRange(week.weekStartAt, week.weekEndAt)}
                  </p>
                  <p className="text-xs text-slate-500">{week.totalMinutes} total minutes</p>
                </div>
                <div className="flex items-center gap-3">
                  <WeeklyStatusBadge status={week.status} />
                  <Link
                    className="text-sm font-semibold text-primary"
                    href={`/athlete/week/${encodeURIComponent(weekKey)}`}
                  >
                    View week
                  </Link>
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="text-sm text-slate-500">No weekly history yet.</Card>
        )}
      </div>
    </div>
  );
}
