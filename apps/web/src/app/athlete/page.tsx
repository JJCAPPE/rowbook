"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ACTIVITY_TYPE_LABELS } from "@rowbook/shared";
import type { TrainingEntry, WeeklyAggregate } from "@rowbook/shared";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { MiniTrendChart } from "@/components/ui/mini-trend-chart";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { ActivityIcon } from "@/components/ui/activity-icon";
import { formatFullDate, formatMinutes, formatDistance, formatWeekRange } from "@/lib/format";
import { trpc } from "@/lib/trpc";

export default function AthleteDashboardPage() {
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

  const entries: TrainingEntry[] = dashboard?.entries ?? [];
  const requiredMinutes = dashboard?.requiredMinutes ?? 0;
  const totalMinutes = dashboard?.totalMinutes ?? 0;
  const totalDistanceKm = entries.reduce((sum, entry) => sum + entry.distance, 0);
  const sessions = entries.length;
  const hasHr = dashboard?.hasHrData ?? false;
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
      }));
  }, [history]);

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
            <StatTile label="HR data" value={hasHr ? "Tracked" : "Missing"} />
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
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-divider/40 bg-content2/70 px-4 py-3"
            >
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
              <StatusBadge status={entry.validationStatus} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
