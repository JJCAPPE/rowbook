"use client";

import { PENDING_PROOF_STATUSES, ProofExtractionStatus, ValidationStatus } from "@rowbook/shared";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatFullDate, formatMinutes, formatDistance, formatPaceWithUnit, formatWatts } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type ReviewEntry = {
  id: string;
  proofImageId: string;
  activityType: "ERG" | "RUN" | "CYCLE" | "SWIM" | "OTHER";
  minutes: number;
  distance: number;
  avgHr: number | null;
  avgPace: number | null;
  avgWatts: number | null;
  notes: string | null;
  date: Date;
  validationStatus: ValidationStatus;
  proofUrl: string | null;
  athleteName: string | null;
  proofExtractionStatus: ProofExtractionStatus | null;
  proofReviewedById: string | null;
};

export default function CoachReviewQueuePage() {
  const utils = trpc.useUtils();
  const searchParams = useSearchParams();
  const [showReviewed, setShowReviewed] = useState(false);
  const weekStartParam = searchParams.get("weekStartAt");
  const weekStartAt = useMemo(() => {
    if (!weekStartParam) {
      return undefined;
    }
    const parsed = new Date(weekStartParam);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, [weekStartParam]);

  const reviewQueueInput = weekStartAt ? { weekStartAt } : undefined;
  const { data, isLoading, error } = trpc.coach.getReviewQueue.useQuery(reviewQueueInput);
  const entries: ReviewEntry[] = data?.entries ?? [];
  const { mutateAsync: overrideStatus, isLoading: isUpdating } =
    trpc.coach.overrideValidationStatus.useMutation({
      onMutate: async ({ entryId }) => {
        await utils.coach.getReviewQueue.cancel(reviewQueueInput);
        const previous = utils.coach.getReviewQueue.getData(reviewQueueInput);

        utils.coach.getReviewQueue.setData(reviewQueueInput, (current) => {
          if (!current) {
            return current;
          }
          return {
            ...current,
            entries: current.entries.filter((entry) => entry.id !== entryId),
          };
        });

        return { previous };
      },
      onError: (_error, _variables, context) => {
        if (context?.previous) {
          utils.coach.getReviewQueue.setData(reviewQueueInput, context.previous);
        }
      },
      onSuccess: async () => {
        await utils.coach.getReviewQueue.invalidate();
        await utils.coach.getTeamOverview.invalidate();
      },
      onSettled: async () => {
        await utils.coach.getReviewQueue.invalidate();
      },
    });

  const isOcrReviewed = (entry: ReviewEntry) =>
    entry.proofExtractionStatus === "COMPLETED"
    && !entry.proofReviewedById
    && (entry.validationStatus === "VERIFIED" || entry.validationStatus === "REJECTED");

  const visibleEntries = showReviewed
    ? entries
    : entries.filter((entry) => !isOcrReviewed(entry));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review queue"
        subtitle="Override proof status for entries that are not checked."
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip isActive={showReviewed} onClick={() => setShowReviewed((prev) => !prev)}>
          Show reviewed
        </FilterChip>
      </div>

      <Card className="space-y-3 p-4">
        {isLoading ? (
          <p className="text-sm text-default-500">Loading review queue...</p>
        ) : error ? (
          <p className="text-sm text-rose-500">Unable to load review queue.</p>
        ) : visibleEntries.length ? (
          visibleEntries.map((entry) => {
            const isProcessing =
              entry.proofExtractionStatus === "PROCESSING"
              || entry.proofExtractionStatus === "PENDING";
            const isFailed = entry.proofExtractionStatus === "FAILED";
            const completed = entry.proofExtractionStatus === "COMPLETED";
            const needsManualAfterOcr =
              completed && PENDING_PROOF_STATUSES.has(entry.validationStatus);
            const ocrVerified =
              completed
              && !entry.proofReviewedById
              && entry.validationStatus === "VERIFIED";
            const ocrRejected =
              completed
              && !entry.proofReviewedById
              && entry.validationStatus === "REJECTED";

            return (
              <div
                key={entry.id}
                className="rounded-2xl border border-divider/40 bg-content2/70 p-3 sm:p-4"
              >
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {entry.activityType} • {formatMinutes(entry.minutes)}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-default-500">
                      <span>{formatFullDate(entry.date)}</span>
                      {entry.athleteName ? (
                        <>
                          <span className="text-default-400">•</span>
                          <span>Athlete: {entry.athleteName}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-start gap-2 md:justify-end">
                    {isProcessing ? (
                      <Badge tone="pending">Supabase OCR job running</Badge>
                    ) : null}
                    {isFailed ? (
                      <Badge tone="danger">OCR failed • manual review</Badge>
                    ) : null}
                    {needsManualAfterOcr ? (
                      <Badge tone="info">OCR incomplete • manual review</Badge>
                    ) : null}
                    {ocrVerified ? <Badge tone="success">OCR verified</Badge> : null}
                    {ocrRejected ? <Badge tone="danger">OCR rejected</Badge> : null}
                    <StatusBadge status={entry.validationStatus} />
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <div className="grid gap-1 text-xs text-default-500 sm:grid-cols-2 md:grid-cols-3">
                      <span>Distance: {formatDistance(entry.distance)}</span>
                      <span>Pace: {formatPaceWithUnit(entry.activityType, entry.avgPace) ?? "—"}</span>
                      {(entry.activityType === "ERG" || entry.activityType === "CYCLE") && (
                        <span>Watts: {formatWatts(entry.avgWatts) ?? "—"}</span>
                      )}
                      <span>Avg HR: {entry.avgHr ?? "—"}</span>
                      <span className="sm:col-span-2">Notes: {entry.notes ?? "—"}</span>
                    </div>
                    {entry.proofUrl ? (
                      <ProofImageViewer src={entry.proofUrl} alt="Workout proof" />
                    ) : (
                      <p className="text-xs text-default-500">Proof not available.</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 md:justify-end">
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
            );
          })
        ) : (
          <p className="text-sm text-default-500">
            {showReviewed ? "No OCR-reviewed entries yet." : "Nothing to review right now."}
          </p>
        )}
      </Card>
    </div>
  );
}
