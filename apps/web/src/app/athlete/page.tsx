"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ACTIVITY_TYPE_LABELS } from "@rowbook/shared";
import type { TrainingEntry, WeeklyAggregate } from "@rowbook/shared";
import { Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { MiniTrendChart } from "@/components/ui/mini-trend-chart";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { ActivityIcon } from "@/components/ui/activity-icon";
import { formatFullDate, formatMinutes, formatDistance, formatWeekRange, formatPaceWithUnit, formatWatts } from "@/lib/format";
import { trpc } from "@/lib/trpc";

export default function AthleteDashboardPage() {
  const utils = trpc.useUtils();
  const searchParams = useSearchParams();
  const weekStartParam = searchParams.get("weekStartAt");
  const weekStartAt = useMemo(() => {
    if (!weekStartParam) {
      return undefined;
    }
    const parsed = new Date(weekStartParam);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, [weekStartParam]);

  const { data: dashboard, isLoading, error } = trpc.athlete.getDashboard.useQuery(
    weekStartAt ? { weekStartAt } : undefined,
  );
  const { data: history } = trpc.athlete.getHistory.useQuery();
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

  const entries = (dashboard?.entries ?? []) as Array<TrainingEntry & { extractedFields: any }>;
  const countedEntries = entries.filter((entry) => entry.validationStatus !== "REJECTED");
  const requiredMinutes = dashboard?.requiredMinutes ?? 0;
  const totalMinutes = dashboard?.totalMinutes ?? 0;
  const totalDistanceKm = countedEntries.reduce((sum, entry) => sum + entry.distance, 0);
  const sessions = countedEntries.length;
  const avgHr = dashboard?.avgHr ?? null;
  const goalMinutes = requiredMinutes > 0 ? requiredMinutes : 1;
  const remainingMinutes =
    requiredMinutes > totalMinutes ? requiredMinutes - totalMinutes : 0;

  const weeklyTrend = useMemo(() => {
    const historyData: WeeklyAggregate[] = history ?? [];
    if (!historyData.length) {
      return [];
    }

    return [...historyData]
      .slice(0, 6)
      .reverse()
      .map((week) => ({
        week: formatWeekRange(week.weekStartAt, week.weekEndAt),
        minutes: week.totalMinutes,
        avgHr: week.avgHr ?? null,
      }));
  }, [history]);

  const handleDelete = async (entryId: string) => {
    const confirmed = window.confirm("Remove this entry? This cannot be undone.");
    if (!confirmed) {
      return;
    }
    await deleteEntry({ id: entryId });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="Loading your weekly stats..." />
        <Card className="text-sm text-default-500">Fetching dashboard...</Card>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" subtitle="We could not load your dashboard." />
        <Card className="text-sm text-rose-500">Please refresh or try again later.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={
          requiredMinutes
            ? `Goal: ${requiredMinutes} minutes this week`
            : "Weekly requirement has not been set yet."
        }
        actions={
          <Button as={Link} href="/athlete/log">
            Log workout
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-2">
              <p className="section-title">Weekly progress</p>
              <p className="text-2xl font-semibold text-foreground">
                {totalMinutes} / {requiredMinutes} min
              </p>
              <p className="text-sm text-default-500">
                {requiredMinutes === 0
                  ? "Waiting for a weekly requirement."
                  : remainingMinutes > 0
                    ? `${remainingMinutes} min remaining`
                    : "Goal met for the week"}
              </p>
            </div>
            <ProgressRing value={totalMinutes} max={goalMinutes} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Distance" value={formatDistance(totalDistanceKm)} />
            <StatTile label="Sessions" value={`${sessions}`} />
            <StatTile label="Avg HR" value={avgHr ? `${avgHr} bpm` : "—"} />
          </div>
        </Card>

        <Card>
          <p className="section-title">Last 6 weeks</p>
          <MiniTrendChart data={weeklyTrend} />
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="section-title">Recent entries</p>
            <p className="text-sm text-default-500">Latest workouts with proof status.</p>
          </div>
          <Link className="text-sm font-semibold text-primary" href="/athlete/history">
            View all
          </Link>
        </div>

        <div className="mt-4 grid gap-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-2xl border border-divider/40 bg-content2/70 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full border border-divider/40 bg-content2/70 p-2">
                    <ActivityIcon type={entry.activityType} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {formatMinutes(entry.minutes)} {ACTIVITY_TYPE_LABELS[entry.activityType]}
                    </p>
                    <p className="text-xs text-default-500">{formatFullDate(entry.date)}</p>
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
              {/* Pace and watts info */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-default-500">
                {entry.avgPace != null && (
                  <span>Pace: {formatPaceWithUnit(entry.activityType, entry.avgPace)}</span>
                )}
                {(entry.activityType === "ERG" || entry.activityType === "CYCLE") && entry.avgWatts != null && (
                  <span>Watts: {formatWatts(entry.avgWatts)}</span>
                )}
                {entry.distance > 0 && (
                  <span>Distance: {formatDistance(entry.distance)}</span>
                )}
              </div>
              {entry.validationStatus === "REJECTED" && entry.rejectionNote && (
                <div className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                  <span className="font-semibold">Rejection reason:</span> {entry.rejectionNote}
                </div>
              )}
              {entry.extractedFields && (
                <details className="mt-2 text-[10px] text-default-500">
                  <summary className="cursor-pointer select-none hover:text-foreground">
                    View Gemini extraction data
                  </summary>
                  <pre className="mt-1 max-h-[150px] overflow-auto rounded border border-divider/40 bg-default-100 p-2 font-mono">
                    {JSON.stringify(entry.extractedFields, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
