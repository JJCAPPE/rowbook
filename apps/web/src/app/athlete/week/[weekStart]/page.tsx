"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { formatFullDate, formatMinutes, formatDistance, formatWeekRange } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { TrainingEntry } from "@rowbook/shared";

type WeekDetailPageProps = {
  params: { weekStart: string };
};

export default function AthleteWeekDetailPage({ params }: WeekDetailPageProps) {
  const weekStartAt = new Date(params.weekStart);
  const { data, isLoading, error } = trpc.athlete.getWeekDetail.useQuery({
    weekStartAt,
  });
  const entries: Array<TrainingEntry & { proofUrl: string | null }> = data?.entries ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Week detail"
        subtitle={
          data
            ? formatWeekRange(data.weekStartAt, data.weekEndAt)
            : "Weekly breakdown and proof uploads."
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile
          label="Total minutes"
          value={data ? formatMinutes(data.totalMinutes) : "—"}
        />
        <StatTile
          label="Total distance"
          value={data ? formatDistance(data.totalDistanceKm) : "—"}
        />
        <StatTile label="Sessions" value={data ? `${data.sessions}` : "—"} />
      </div>

      <Card className="space-y-4">
        <p className="section-title">Entries</p>
        <div className="grid gap-4">
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading entries...</p>
          ) : error ? (
            <p className="text-sm text-rose-500">Unable to load entries.</p>
          ) : entries.length ? (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-100 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {entry.activityType} • {formatMinutes(entry.minutes)}
                    </p>
                    <p className="text-xs text-slate-500">{formatFullDate(entry.date)}</p>
                  </div>
                  <StatusBadge status={entry.validationStatus} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                  <span>Distance: {formatDistance(entry.distance)}</span>
                  <span>Avg HR: {entry.avgHr ?? "—"}</span>
                  <span>Notes: {entry.notes ?? "—"}</span>
                </div>
                <div className="mt-3">
                  {entry.proofUrl ? (
                    <ProofImageViewer src={entry.proofUrl} alt="Workout proof" />
                  ) : (
                    <p className="text-xs text-slate-500">Proof not available.</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No entries for this week.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
