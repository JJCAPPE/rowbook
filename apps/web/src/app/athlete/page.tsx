import Link from "next/link";
import { ACTIVITY_TYPE_LABELS } from "@rowbook/shared";

import { PageHeader } from "@/components/layout/page-header";
import { MiniTrendChart } from "@/components/ui/mini-trend-chart";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { ActivityIcon } from "@/components/ui/activity-icon";
import { formatFullDate, formatMinutes, formatDistance } from "@/lib/format";
import { athleteProfile, recentEntries, weeklyTrend } from "@/lib/mock-data";

export default function AthleteDashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Goal: ${athleteProfile.requiredMinutes} minutes this week`}
        actions={
          <Link
            href="/athlete/log"
            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Log workout
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-2">
              <p className="section-title">Weekly progress</p>
              <p className="text-2xl font-semibold text-ink">
                {athleteProfile.totalMinutes} / {athleteProfile.requiredMinutes} min
              </p>
              <p className="text-sm text-slate-500">
                {athleteProfile.totalMinutes < athleteProfile.requiredMinutes
                  ? `${athleteProfile.requiredMinutes - athleteProfile.totalMinutes} min remaining`
                  : "Goal met for the week"}
              </p>
            </div>
            <ProgressRing value={athleteProfile.totalMinutes} max={athleteProfile.requiredMinutes} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Distance" value={formatDistance(athleteProfile.totalDistanceKm)} />
            <StatTile label="Sessions" value={`${athleteProfile.sessions}`} />
            <StatTile label="HR data" value={athleteProfile.hasHr ? "Tracked" : "Missing"} />
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
            <p className="text-sm text-slate-500">Latest workouts with proof status.</p>
          </div>
          <Link className="text-sm font-semibold text-primary" href="/athlete/history">
            View all
          </Link>
        </div>

        <div className="mt-4 grid gap-3">
          {recentEntries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-slate-100 p-2">
                  <ActivityIcon type={entry.activityType} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {formatMinutes(entry.minutes)} {ACTIVITY_TYPE_LABELS[entry.activityType]}
                  </p>
                  <p className="text-xs text-slate-500">{formatFullDate(entry.date)}</p>
                </div>
              </div>
              <StatusBadge status={entry.status} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
