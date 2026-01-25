import { ActivityMixChart } from "@/components/charts/activity-mix-chart";
import { WeeklyTrendChart } from "@/components/charts/weekly-trend-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatFullDate, formatMinutes, formatDistance } from "@/lib/format";
import { coachAthleteDetail } from "@/lib/mock-data";

export default function CoachAthleteDetailPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={coachAthleteDetail.name}
        subtitle="Weekly trends and proof status."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <p className="section-title">Weekly minutes trend</p>
          <WeeklyTrendChart data={coachAthleteDetail.weeklyTrend} />
        </Card>
        <Card>
          <p className="section-title">Activity mix</p>
          <ActivityMixChart data={coachAthleteDetail.activityMix} />
        </Card>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="section-title">Recent entries</p>
          <span className="text-xs text-slate-500">Proof images retained 7 days</span>
        </div>
        <div className="grid gap-4">
          {coachAthleteDetail.entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-slate-100 bg-white p-4">
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
