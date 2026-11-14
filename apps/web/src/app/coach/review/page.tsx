"use client";

import { PENDING_PROOF_STATUSES, type ProofExtractionStatus, type ValidationStatus } from "@rowbook/shared";
import { Spinner } from "@heroui/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { FilterChip } from "@/components/ui/filter-chip";
import { ProofExtractionFeedback } from "@/components/ui/proof-extraction-feedback";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatDistance,
  formatFullDate,
  formatMinutes,
  formatPaceWithUnit,
  formatWatts,
} from "@/lib/format";
import { trpc } from "@/lib/trpc";

type ReviewState = "NEEDS_REVIEW" | "CHECKING" | "COMPLETED";
type RowState = "idle" | "saving" | "saved";

type ReviewEntry = {
  id: string;
  version: number;
  activityType: "ERG" | "RUN" | "CYCLE" | "SWIM" | "OTHER";
  minutes: number;
  distance: number;
  avgHr: number | null;
  avgPace: number | null;
  avgWatts: number | null;
  notes: string | null;
  date: Date;
  validationStatus: ValidationStatus;
  rejectionNote: string | null;
  reviewedAt: Date | null;
  athleteName: string;
  proofExtractionStatus: ProofExtractionStatus | null;
  extractionFailureCode: string | null;
  extractedFields: unknown;
  proofs: Array<{
    id: string;
    fileName: string | null;
    validationStatus: ValidationStatus;
    available: boolean;
  }>;
};

const stateLabels: Record<ReviewState, string> = {
  NEEDS_REVIEW: "Needs review",
  CHECKING: "Checking",
  COMPLETED: "Reviewed",
};

function ReviewEvidence({
  entryId,
  version,
}: {
  entryId: string;
  version: number;
}) {
  const [requested, setRequested] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const article = containerRef.current?.closest("article");
    if (!article) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRequested(true);
          observer.disconnect();
        }
      },
      { rootMargin: "800px" },
    );
    observer.observe(article);
    return () => observer.disconnect();
  }, []);

  const evidence = trpc.coach.getReviewEvidence.useQuery(
    { entryId, expectedVersion: version },
    {
      enabled: requested,
      retry: false,
      staleTime: 10 * 60 * 1000,
      meta: { blocksPageLoading: false },
    },
  );

  return (
    <div ref={containerRef} className="min-w-0">
      {!requested || evidence.isLoading || (evidence.error && evidence.isFetching) ? (
        <div
          role="status"
          className="flex aspect-[4/3] min-h-56 w-full items-center justify-center gap-2 rounded-xl border border-divider/40 bg-content1/70 text-sm text-default-500"
        >
          <AppLoadingScreen compact />
        </div>
      ) : evidence.error ? (
        <div
          className="flex aspect-[4/3] min-h-56 w-full flex-col items-center justify-center gap-3 rounded-xl border border-divider/40 bg-content1/70 p-4 text-center"
          role="alert"
        >
          <p className="text-sm text-rose-600">Evidence could not be loaded.</p>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={evidence.isFetching}
            onClick={() => void evidence.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : evidence.data?.images.length ? (
        <ProofImageViewer
          images={evidence.data.images}
          alt="Workout evidence"
          inline
          onRefresh={() => evidence.refetch()}
        />
      ) : (
        <p className="text-sm text-default-500">Evidence has expired.</p>
      )}
    </div>
  );
}

export default function CoachReviewQueuePage() {
  const utils = trpc.useUtils();
  const searchParams = useSearchParams();
  const [reviewState, setReviewState] = useState<ReviewState>("NEEDS_REVIEW");
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [hiddenEntryIds, setHiddenEntryIds] = useState<string[]>([]);
  const [rejectingEntryId, setRejectingEntryId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const weekStartParam = searchParams.get("weekStartAt");
  const teamId = searchParams.get("teamId") ?? undefined;
  const weekStartAt = useMemo(() => {
    if (!weekStartParam) return undefined;
    const parsed = new Date(weekStartParam);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, [weekStartParam]);

  useEffect(() => {
    setCursorStack([undefined]);
    setHiddenEntryIds([]);
    setRowErrors({});
  }, [reviewState, teamId, weekStartParam]);

  const cursor = cursorStack[cursorStack.length - 1];
  const reviewQueueInput = useMemo(
    () => ({
      ...(teamId ? { teamId } : {}),
      ...(weekStartAt ? { weekStartAt } : {}),
      state: reviewState,
      limit: 20,
      ...(cursor ? { cursor } : {}),
    }),
    [cursor, reviewState, teamId, weekStartAt],
  );
  const queue = trpc.coach.getReviewQueue.useQuery(reviewQueueInput, {
    keepPreviousData: true,
  });
  const entries = (queue.data?.entries ?? []) as ReviewEntry[];
  const visibleEntries = entries.filter(
    (entry) => !hiddenEntryIds.includes(entry.id),
  );

  const review = trpc.coach.overrideValidationStatus.useMutation();

  const handleReview = useCallback(
    async (
      entry: ReviewEntry,
      decision: "VERIFIED" | "REJECTED",
      reason?: string,
    ) => {
      setRowStates((current) => ({ ...current, [entry.id]: "saving" }));
      setRowErrors((current) => ({ ...current, [entry.id]: "" }));
      try {
        await review.mutateAsync(
          decision === "VERIFIED"
            ? {
                entryId: entry.id,
                expectedVersion: entry.version,
                decision,
              }
            : {
                entryId: entry.id,
                expectedVersion: entry.version,
                decision,
                reason: reason?.trim() ?? "",
              },
        );
        setRowStates((current) => ({ ...current, [entry.id]: "saved" }));
        setHiddenEntryIds((current) => [...new Set([...current, entry.id])]);
        setRejectingEntryId(null);
        setRejectionReason("");
        void Promise.all([
          utils.coach.getReviewQueue.invalidate(),
          utils.coach.getTeamOverview.invalidate(),
        ]);
      } catch (error) {
        setRowStates((current) => ({ ...current, [entry.id]: "idle" }));
        setRowErrors((current) => ({
          ...current,
          [entry.id]:
            error instanceof Error
              ? error.message
              : "Review was not saved. Try again.",
        }));
      }
    },
    [review, utils.coach.getReviewQueue, utils.coach.getTeamOverview],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Review workouts"
        subtitle="Check only the workouts that need a person’s decision."
      />

      <div className="flex flex-wrap gap-2" aria-label="Review queue filters">
        {(Object.keys(stateLabels) as ReviewState[]).map((state) => (
          <FilterChip
            key={state}
            isActive={reviewState === state}
            onClick={() => setReviewState(state)}
          >
            {stateLabels[state]}
          </FilterChip>
        ))}
      </div>

      <Card className="space-y-4 p-3 sm:p-5">
        {queue.isLoading && !queue.data ? (
          <div
            role="status"
            className="flex items-center gap-2 py-8 text-sm text-default-500"
          >
            <AppLoadingScreen compact />
          </div>
        ) : queue.error ? (
          <div className="space-y-3 py-6" role="alert">
            <p className="text-sm text-rose-600">
              Unable to load the review queue.
            </p>
            <Button variant="outline" onClick={() => void queue.refetch()}>
              Try again
            </Button>
          </div>
        ) : visibleEntries.length ? (
          visibleEntries.map((entry) => {
            const rowState = rowStates[entry.id] ?? "idle";
            const isSaving = rowState === "saving";
            const isRejecting = rejectingEntryId === entry.id;
            return (
              <article
                key={entry.id}
                className="grid items-start gap-5 rounded-2xl border border-divider/50 bg-content2/50 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"
              >
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-col gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-foreground">
                        {entry.athleteName}
                      </h2>
                      <p className="text-sm text-default-500">
                        {formatFullDate(entry.date)} · {entry.activityType} ·{" "}
                        {formatMinutes(entry.minutes)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 empty:hidden">
                      {entry.proofExtractionStatus === "PROCESSING" ||
                      entry.proofExtractionStatus === "PENDING" ? (
                        <Badge tone="pending">Photo check running</Badge>
                      ) : null}
                      {entry.proofExtractionStatus === "FAILED" ? (
                        <Badge tone="danger">Photo check needs help</Badge>
                      ) : null}
                      {!PENDING_PROOF_STATUSES.has(entry.validationStatus) ? (
                        <StatusBadge status={entry.validationStatus} />
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl border border-divider/40 bg-content1/70 p-3 text-sm">
                    <div>
                      <span className="block text-xs text-default-500">
                        Distance
                      </span>
                      <strong>{formatDistance(entry.distance)}</strong>
                    </div>
                    <div>
                      <span className="block text-xs text-default-500">
                        Average HR
                      </span>
                      <strong>{entry.avgHr ?? "Not entered"}</strong>
                    </div>
                    <div>
                      <span className="block text-xs text-default-500">Pace</span>
                      <strong>
                        {formatPaceWithUnit(entry.activityType, entry.avgPace) ??
                          "—"}
                      </strong>
                    </div>
                    <div>
                      <span className="block text-xs text-default-500">
                        Watts
                      </span>
                      <strong>{formatWatts(entry.avgWatts) ?? "—"}</strong>
                    </div>
                  </div>

                  {entry.notes ? (
                    <p className="whitespace-pre-wrap break-words text-sm text-default-600">
                      {entry.notes}
                    </p>
                  ) : null}

                  {entry.rejectionNote ? (
                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      Previous rejection: {entry.rejectionNote}
                    </p>
                  ) : null}

                  {entry.extractedFields ? (
                    <ProofExtractionFeedback
                      fields={entry.extractedFields}
                      compact
                      enteredFields={{
                        activityType: entry.activityType,
                        date: entry.date,
                        minutes: entry.minutes,
                        distance: entry.distance,
                        avgHr: entry.avgHr,
                      }}
                    />
                  ) : (
                    <p className="text-sm text-default-500">
                      No reliable values could be read automatically.
                    </p>
                  )}

                  {reviewState === "NEEDS_REVIEW" ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="min-h-11"
                        disabled={isSaving}
                        onClick={() => void handleReview(entry, "VERIFIED")}
                      >
                        {isSaving ? <Spinner size="sm" /> : null}
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-11"
                        disabled={isSaving}
                        onClick={() => {
                          setRejectingEntryId(entry.id);
                          setRejectionReason(entry.rejectionNote ?? "");
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}

                  {isRejecting ? (
                    <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                      <label
                        htmlFor={`reason-${entry.id}`}
                        className="text-sm font-semibold text-rose-900"
                      >
                        Why is this workout being rejected?
                      </label>
                      <textarea
                        id={`reason-${entry.id}`}
                        autoFocus
                        maxLength={500}
                        rows={3}
                        value={rejectionReason}
                        onChange={(event) =>
                          setRejectionReason(event.target.value)
                        }
                        className="w-full rounded-xl border border-rose-200 bg-white p-3 text-base text-foreground outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                        placeholder="Give the athlete a clear reason and next step."
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="ghost"
                          disabled={isSaving}
                          onClick={() => {
                            setRejectingEntryId(null);
                            setRejectionReason("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={isSaving || !rejectionReason.trim()}
                          onClick={() =>
                            void handleReview(entry, "REJECTED", rejectionReason)
                          }
                        >
                          {isSaving ? <Spinner size="sm" /> : null}
                          Confirm rejection
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {rowErrors[entry.id] ? (
                    <p role="alert" className="text-sm font-medium text-rose-600">
                      {rowErrors[entry.id]}
                    </p>
                  ) : null}
                </div>

                {entry.proofs.some((proof) => proof.available) ? (
                  <ReviewEvidence entryId={entry.id} version={entry.version} />
                ) : (
                  <p className="flex aspect-[4/3] min-h-56 w-full items-center justify-center rounded-xl border border-divider/40 bg-content1/70 p-4 text-sm text-default-500">
                    Evidence has expired.
                  </p>
                )}
              </article>
            );
          })
        ) : (
          <div className="py-10 text-center">
            <p className="font-medium text-foreground">
              {reviewState === "NEEDS_REVIEW"
                ? "Nothing needs review"
                : reviewState === "CHECKING"
                  ? "No photo checks are running"
                  : "No reviewed workouts this week"}
            </p>
            <p className="mt-1 text-sm text-default-500">
              This list is limited to the selected week.
            </p>
          </div>
        )}

        {queue.data ? (
          <nav
            className="flex items-center justify-between border-t border-divider/40 pt-4"
            aria-label="Review pages"
          >
            <Button
              variant="ghost"
              disabled={cursorStack.length === 1 || queue.isFetching}
              onClick={() => setCursorStack((current) => current.slice(0, -1))}
            >
              Previous
            </Button>
            <span className="text-sm tabular-nums text-default-500">
              Page {cursorStack.length}
            </span>
            <Button
              variant="ghost"
              disabled={!queue.data.nextCursor || queue.isFetching}
              onClick={() => {
                if (queue.data.nextCursor) {
                  setCursorStack((current) => [
                    ...current,
                    queue.data!.nextCursor!,
                  ]);
                }
              }}
            >
              Next
            </Button>
          </nav>
        ) : null}
      </Card>
    </div>
  );
}
