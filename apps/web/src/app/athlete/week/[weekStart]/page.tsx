"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { ProofExtractionFeedback } from "@/components/ui/proof-extraction-feedback";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { formatFullDate, formatMinutes, formatDistance, formatWeekRange, formatPaceWithUnit, formatWatts } from "@/lib/format";
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
  const entries: Array<TrainingEntry & { proofUrl: string | null; extractedFields: any }> = data?.entries ?? [];

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
            <p className="text-sm text-default-500">Loading entries...</p>
          ) : error ? (
            <p className="text-sm text-rose-500">Unable to load entries.</p>
          ) : entries.length ? (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-2xl border border-divider/40 bg-content2/70 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {entry.activityType} • {formatMinutes(entry.minutes)}
                    </p>
                    <p className="text-xs text-default-500">{formatFullDate(entry.date)}</p>
                  </div>
                  <StatusBadge status={entry.validationStatus} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-default-500 sm:grid-cols-2 md:grid-cols-3">
                  <span>Distance: {formatDistance(entry.distance)}</span>
                  <span>Pace: {formatPaceWithUnit(entry.activityType, entry.avgPace) ?? "—"}</span>
                  {(entry.activityType === "ERG" || entry.activityType === "CYCLE") && (
                    <span>Watts: {formatWatts(entry.avgWatts) ?? "—"}</span>
                  )}
                  <span>Avg HR: {entry.avgHr ?? "—"}</span>
                  <span className="sm:col-span-2">Notes: {entry.notes ?? "—"}</span>
                </div>
                {entry.validationStatus === "REJECTED" && entry.rejectionNote && (
                  <div className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                    <span className="font-semibold text-rose-600">Rejection reason:</span> {entry.rejectionNote}
                  </div>
                )}
                {entry.extractedFields && (
                  <details className="mt-3 text-[10px] text-default-500">
                    <summary className="cursor-pointer select-none hover:text-foreground">
                      View details from Gemini extraction
                    </summary>
                    <ProofExtractionFeedback fields={entry.extractedFields} />
                  </details>
                )}
                <div className="mt-3">
                  {entry.proofUrl ? (
                    <ProofImageViewer src={entry.proofUrl} alt="Workout proof" />
                  ) : (
                    <p className="text-xs text-default-500">Proof not available.</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-default-500">No entries for this week.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
