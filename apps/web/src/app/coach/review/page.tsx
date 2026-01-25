import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatFullDate, formatMinutes, formatDistance } from "@/lib/format";
import { reviewQueue } from "@/lib/mock-data";

export default function CoachReviewQueuePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Review queue"
        subtitle="Override proof status for entries that are not checked."
      />

      <Card className="space-y-4">
        {reviewQueue.map((entry) => (
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
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
              <ProofImageViewer src={entry.proofUrl} alt="Workout proof" />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" type="button">
                  Mark verified
                </Button>
                <Button variant="ghost" size="sm" type="button">
                  Reject
                </Button>
              </div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
