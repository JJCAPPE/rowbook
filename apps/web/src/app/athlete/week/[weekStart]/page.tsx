"use client";

import { Spinner } from "@heroui/react";
import Link from "next/link";
import { use, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { ProofExtractionFeedback } from "@/components/ui/proof-extraction-feedback";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { formatFullDate, formatMinutes, formatDistance, formatWeekRange, formatPaceWithUnit, formatWatts } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { TrainingEntry } from "@rowbook/shared";

type WeekDetailPageProps = {
  params: Promise<{ weekStart: string }>;
};

function AthleteEntryEvidence({
  entryId,
  version,
  count,
}: {
  entryId: string;
  version: number;
  count: number;
}) {
  const [requested, setRequested] = useState(false);
  const evidence = trpc.athlete.getEntryEvidence.useQuery(
    { entryId, expectedVersion: version },
    { enabled: requested, retry: false, staleTime: 10 * 60 * 1000 },
  );

  if (!requested) {
    return (
      <Button size="sm" variant="outline" onClick={() => setRequested(true)}>
        Load {count === 1 ? "evidence" : `${count} evidence images`}
      </Button>
    );
  }
  if (evidence.isLoading) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-default-500">
        <Spinner size="sm" /> Loading secure evidence…
      </p>
    );
  }
  if (evidence.error) {
    return (
      <div className="flex flex-wrap items-center gap-2" role="alert">
        <span className="text-sm text-rose-600">Evidence could not be loaded.</span>
        <Button size="sm" variant="outline" onClick={() => void evidence.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!evidence.data?.images.length) {
    return <p className="text-sm text-default-500">Evidence has expired.</p>;
  }

  return (
    <ProofImageViewer
      images={evidence.data.images}
      alt="Workout evidence"
      onRefresh={() => evidence.refetch()}
    />
  );
}

export default function AthleteWeekDetailPage(props: WeekDetailPageProps) {
  const params = use(props.params);
  const parsedWeekStartAt = new Date(params.weekStart);
  const hasValidWeek = !Number.isNaN(parsedWeekStartAt.getTime());
  const weekStartAt = hasValidWeek ? parsedWeekStartAt : new Date(0);
  const { data, isLoading, error } = trpc.athlete.getWeekDetail.useQuery({
    weekStartAt,
  }, { enabled: hasValidWeek, retry: false });
  const entries: Array<
    TrainingEntry & {
      extractedFields: unknown;
      proofs: Array<{ id: string; available: boolean }>;
    }
  > = data?.entries ?? [];

  if (!hasValidWeek) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Week not found"
          subtitle="That week link is invalid or incomplete."
        />
        <Card className="space-y-3 text-sm text-default-600">
          <p>Choose a week from your training history to continue.</p>
          <Button as={Link} href="/athlete/history" className="w-fit">
            Back to history
          </Button>
        </Card>
      </div>
    );
  }

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
                {entry.extractedFields != null && (
                  <details className="mt-3 text-[10px] text-default-500">
                    <summary className="cursor-pointer select-none hover:text-foreground">
                      View details from AI extraction
                    </summary>
                    <ProofExtractionFeedback fields={entry.extractedFields} />
                  </details>
                )}
                <div className="mt-3">
                  {entry.proofs.length ? (
                    <AthleteEntryEvidence
                      entryId={entry.id}
                      version={entry.version}
                      count={entry.proofs.length}
                    />
                  ) : (
                    <p className="text-xs text-default-500">Evidence has expired.</p>
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
