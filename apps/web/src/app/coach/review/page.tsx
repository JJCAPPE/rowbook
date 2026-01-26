"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatFullDate, formatMinutes, formatDistance } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

type ReviewEntry = {
  id: string;
  proofImageId: string;
  activityType: "ERG" | "RUN" | "CYCLE" | "SWIM" | "OTHER";
  minutes: number;
  distance: number;
  avgHr: number | null;
  notes: string | null;
  date: Date;
  validationStatus: "NOT_CHECKED" | "PENDING" | "VERIFIED" | "REJECTED" | "EXTRACTION_INCOMPLETE";
  proofUrl: string | null;
  athleteName: string | null;
};

export default function CoachReviewQueuePage() {
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

  const { data, isLoading, error } = trpc.coach.getReviewQueue.useQuery(
    weekStartAt ? { weekStartAt } : undefined,
  );
  const entries: ReviewEntry[] = data?.entries ?? [];
  const { mutateAsync: overrideStatus, isLoading: isUpdating } =
    trpc.coach.overrideValidationStatus.useMutation({
      onSuccess: async () => {
        await utils.coach.getReviewQueue.invalidate();
        await utils.coach.getTeamOverview.invalidate();
      },
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review queue"
        subtitle="Override proof status for entries that are not checked."
      />

      <Card className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-default-500">Loading review queue...</p>
        ) : error ? (
          <p className="text-sm text-rose-500">Unable to load review queue.</p>
        ) : entries.length ? (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-divider/40 bg-content2/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {entry.activityType} • {formatMinutes(entry.minutes)}
                  </p>
                  <p className="text-xs text-default-500">{formatFullDate(entry.date)}</p>
                  {entry.athleteName ? (
                    <p className="text-xs text-default-500">Athlete: {entry.athleteName}</p>
                  ) : null}
                </div>
                <StatusBadge status={entry.validationStatus} />
              </div>
              <div className="mt-3 grid gap-2 text-xs text-default-500 sm:grid-cols-3">
                <span>Distance: {formatDistance(entry.distance)}</span>
                <span>Avg HR: {entry.avgHr ?? "—"}</span>
                <span>Notes: {entry.notes ?? "—"}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                {entry.proofUrl ? (
                  <ProofImageViewer src={entry.proofUrl} alt="Workout proof" />
                ) : (
                  <p className="text-xs text-default-500">Proof not available.</p>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    disabled={isUpdating}
                    onClick={() =>
                      overrideStatus({ entryId: entry.id, status: "VERIFIED" })
                    }
                  >
                    Mark verified
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    disabled={isUpdating}
                    onClick={() =>
                      overrideStatus({ entryId: entry.id, status: "REJECTED" })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-default-500">Nothing to review right now.</p>
        )}
      </Card>
    </div>
  );
}
