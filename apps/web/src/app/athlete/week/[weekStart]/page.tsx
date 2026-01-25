import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { formatFullDate, formatMinutes, formatDistance, formatWeekRange } from "@/lib/format";
import { athleteHistory, recentEntries } from "@/lib/mock-data";

type WeekDetailPageProps = {
  params: { weekStart: string };
};

export default function AthleteWeekDetailPage({ params }: WeekDetailPageProps) {
  const week = athleteHistory.find((item) => item.weekStart.toISOString().slice(0, 10) === params.weekStart);
  const totalMinutes = recentEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  const totalDistance = recentEntries.reduce((sum, entry) => sum + (entry.distanceKm ?? 0), 0);
  const sessions = recentEntries.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Week detail"
        subtitle={
          week
            ? formatWeekRange(week.weekStart, week.weekEnd)
            : "Weekly breakdown and proof uploads."
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <StatTile label="Total minutes" value={formatMinutes(totalMinutes)} />
        <StatTile label="Total distance" value={formatDistance(totalDistance)} />
        <StatTile label="Sessions" value={`${sessions}`} />
      </div>

      <Card className="space-y-4">
        <p className="section-title">Entries</p>
        <div className="grid gap-4">
          {recentEntries.map((entry) => (
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
                <StatusBadge status={entry.status} />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-3">
                <span>Distance: {formatDistance(entry.distanceKm)}</span>
                <span>Avg HR: {entry.avgHr ?? "—"}</span>
                <span>Notes: {entry.notes ?? "—"}</span>
              </div>
              <div className="mt-3">
                <ProofImageViewer src={entry.proofUrl} alt="Workout proof" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
