"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ActivityMixChart } from "@/components/charts/activity-mix-chart";
import { WeeklyTrendChart } from "@/components/charts/weekly-trend-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatFullDate, formatMinutes, formatDistance, formatWeekRange } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import type { TrainingEntry } from "@rowbook/shared";

type CoachAthleteDetailPageProps = {
  params: { id: string };
};

export default function CoachAthleteDetailPage({ params }: CoachAthleteDetailPageProps) {
  const router = useRouter();
  const { data, isLoading, error } = trpc.coach.getAthleteDetail.useQuery({
    athleteId: params.id,
  });
  const { data: overview } = trpc.coach.getTeamOverview.useQuery();
  const entries: Array<TrainingEntry & { proofUrl: string | null }> = data?.entries ?? [];

  const weeklyTrend = useMemo(() => {
    if (!data?.history?.length) {
      return [];
    }
    return [...data.history]
      .slice(0, 12)
      .reverse()
      .map((week) => ({
        week: formatWeekRange(week.weekStartAt, week.weekEndAt),
        minutes: week.totalMinutes,
        avgHr: week.avgHr ?? null,
      }));
  }, [data?.history]);

  const activityMix = useMemo(() => data?.activityMix ?? [], [data?.activityMix]);
  const athleteOptions = useMemo(() => {
    const options = (overview?.leaderboard ?? []).map((row) => ({
      id: row.athleteId,
      name: row.name,
    }));

    if (data?.athlete && !options.some((option) => option.id === data.athlete.id)) {
      options.push({ id: data.athlete.id, name: data.athlete.name });
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [overview?.leaderboard, data?.athlete]);
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
                  router.push(`/coach/athlete/${nextAthleteId}`);
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
          <span className="text-xs text-default-500">Proof images retained 7 days</span>
        </div>
        <div className="grid gap-4">
          {isLoading ? (
            <p className="text-sm text-default-500">Loading athlete entries...</p>
          ) : error ? (
            <p className="text-sm text-rose-500">Unable to load athlete detail.</p>
          ) : entries.length ? (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-divider/40 bg-content2/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {entry.activityType} • {formatMinutes(entry.minutes)}
                    </p>
                    <p className="text-xs text-default-500">{formatFullDate(entry.date)}</p>
                  </div>
                  <StatusBadge status={entry.validationStatus} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-default-500 sm:grid-cols-3">
                  <span>Distance: {formatDistance(entry.distance)}</span>
                  <span>Avg HR: {entry.avgHr ?? "—"}</span>
                  <span>Notes: {entry.notes ?? "—"}</span>
                </div>
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
            <p className="text-sm text-default-500">No entries yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
