import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { WeeklyStatusBadge } from "@/components/ui/weekly-status-badge";
import { formatWeekRange } from "@/lib/format";
import { athleteHistory } from "@/lib/mock-data";

export default function AthleteHistoryPage() {
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
        {athleteHistory.map((week) => {
          const weekKey = week.weekStart.toISOString().slice(0, 10);
          return (
            <Card key={weekKey} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">
                  {formatWeekRange(week.weekStart, week.weekEnd)}
                </p>
                <p className="text-xs text-slate-500">{week.totalMinutes} total minutes</p>
              </div>
              <div className="flex items-center gap-3">
                <WeeklyStatusBadge status={week.status} />
                <Link className="text-sm font-semibold text-primary" href={`/athlete/week/${weekKey}`}>
                  View week
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
