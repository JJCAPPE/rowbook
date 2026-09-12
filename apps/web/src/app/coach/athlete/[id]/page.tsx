"use client";

import { Spinner } from "@heroui/react";
import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActivityMixChart } from "@/components/charts/activity-mix-chart";
import { WeeklyTrendChart } from "@/components/charts/weekly-trend-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatFullDate,
  formatMinutes,
  formatDistance,
  formatWeekRange,
} from "@/lib/format";
import { trpc } from "@/lib/trpc";

type CoachAthleteDetailPageProps = {
  params: Promise<{ id: string }>;
};

function CoachEntryEvidence({
  entryId,
  version,
  count,
}: {
  entryId: string;
  version: number;
  count: number;
}) {
  const [requested, setRequested] = useState(false);
  const evidence = trpc.coach.getReviewEvidence.useQuery(
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

export default function CoachAthleteDetailPage(
  props: CoachAthleteDetailPageProps,
) {
  const params = use(props.params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("teamId") ?? undefined;
  const { data, isLoading, error } = trpc.coach.getAthleteDetail.useQuery({
    athleteId: params.id,
    ...(teamId ? { teamId } : {}),
  });
  const { data: roster } = trpc.coach.listAthletes.useQuery(
    teamId ? { teamId } : undefined,
  );
  const entries: any[] = data?.entries ?? [];

  const weeklyTrend = data?.history?.length
    ? [...data.history]
        .slice(0, 12)
        .reverse()
        .map((week) => ({
          week: formatWeekRange(week.weekStartAt, week.weekEndAt),
          minutes: week.totalMinutes,
          avgHr: week.avgHr ?? null,
        }))
    : [];
  const activityMix = data?.activityMix ?? [];
  const athleteOptions = [...(roster ?? [])];

  if (
    data?.athlete &&
    !athleteOptions.some((option) => option.id === data.athlete.id)
  ) {
    athleteOptions.push({ id: data.athlete.id, name: data.athlete.name });
  }

  athleteOptions.sort((a, b) => a.name.localeCompare(b.name));
  const selectedAthleteId = data?.athlete?.id ?? params.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.athlete?.name ?? "Athlete detail"}
        subtitle="Weekly trends and proof status."
        actions={
          <div className="min-w-[220px] space-y-2">
            <Label htmlFor="coachAthleteSelect">Athlete</Label>
            <Select
              id="coachAthleteSelect"
              value={selectedAthleteId}
              onChange={(event) => {
                const nextAthleteId = event.target.value;
                if (nextAthleteId && nextAthleteId !== selectedAthleteId) {
                  const query = searchParams.toString();
                  router.push(
                    `/coach/athlete/${nextAthleteId}${query ? `?${query}` : ""}`,
                  );
                }
              }}
              className="w-full"
              disabled={!athleteOptions.length}
            >
              {athleteOptions.length ? (
                athleteOptions.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.name}
                  </option>
                ))
              ) : (
                <option value={selectedAthleteId}>Loading athletes...</option>
              )}
            </Select>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="section-title">Weekly minutes trend</p>
          <WeeklyTrendChart data={weeklyTrend} />
        </Card>
        <Card>
          <p className="section-title">Activity mix</p>
          <ActivityMixChart data={activityMix} />
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="section-title">Recent entries</p>
          <span className="text-xs text-default-500">
            Proof images retained 7 days
          </span>
        </div>
        <div className="grid gap-4">
          {isLoading ? (
            <p className="text-sm text-default-500">
              Loading athlete entries...
            </p>
          ) : error ? (
            <p className="text-sm text-rose-500">
              Unable to load athlete detail.
            </p>
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
                    <p className="text-xs text-default-500">
                      {formatFullDate(entry.date)}
                    </p>
                  </div>
                  <StatusBadge status={entry.validationStatus} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-default-500 sm:grid-cols-3">
                  <span>Distance: {formatDistance(entry.distance)}</span>
                  <span>Avg HR: {entry.avgHr ?? "—"}</span>
                  <span>Notes: {entry.notes ?? "—"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.proofs?.length ? (
                    <CoachEntryEvidence
                      entryId={entry.id}
                      version={entry.version}
                      count={entry.proofs.length}
                    />
                  ) : (
                    <p className="text-xs text-default-500">
                      Evidence has expired.
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-default-500">No entries yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
