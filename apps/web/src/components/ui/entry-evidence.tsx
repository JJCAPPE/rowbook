"use client";

import { useState } from "react";

import { AppLoadingScreen } from "@/components/ui/app-loading-screen";
import { Button } from "@/components/ui/button";
import { ProofExtractionFeedback } from "@/components/ui/proof-extraction-feedback";
import { ProofImageViewer } from "@/components/ui/proof-image-viewer";
import type { EnteredWorkoutFields } from "@/lib/proof-field-comparison";
import { trpc } from "@/lib/trpc";

type EntryEvidenceProps = {
  entry: EnteredWorkoutFields & {
    id: string;
    version: number;
    extractedFields: unknown;
    proofs: Array<{ available: boolean }>;
  };
  coach?: boolean;
};

export function EntryEvidence({ entry, coach = false }: EntryEvidenceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasEvidence = entry.proofs.some((proof) => proof.available);
  const input = { entryId: entry.id, expectedVersion: entry.version };
  const options = {
    retry: false,
    staleTime: 10 * 60 * 1000,
    meta: { blocksPageLoading: false },
  };
  const athleteEvidence = trpc.athlete.getEntryEvidence.useQuery(input, {
    ...options,
    enabled: isOpen && hasEvidence && !coach,
  });
  const coachEvidence = trpc.coach.getReviewEvidence.useQuery(input, {
    ...options,
    enabled: isOpen && hasEvidence && coach,
  });
  const evidence = coach ? coachEvidence : athleteEvidence;

  return (
    <details
      className="mt-3"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-default-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        View evidence
      </summary>
      {isOpen ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <div className="min-w-0">
            {entry.extractedFields ? (
              <ProofExtractionFeedback
                fields={entry.extractedFields}
                enteredFields={entry}
                compact
              />
            ) : (
              <p className="text-sm text-default-500">
                No reliable values could be read automatically.
              </p>
            )}
          </div>
          <div className="min-w-0">
            {!hasEvidence ? (
              <p className="text-sm text-default-500">Evidence has expired.</p>
            ) : evidence.isLoading || (evidence.error && evidence.isFetching) ? (
              <div className="flex aspect-[4/3] min-h-56 w-full items-center justify-center rounded-xl border border-divider/40 bg-content2/70">
                <AppLoadingScreen compact />
              </div>
            ) : evidence.error ? (
              <div className="space-y-3 text-sm" role="alert">
                <p className="text-rose-600">Evidence could not be loaded.</p>
                <Button size="sm" variant="outline" onClick={() => void evidence.refetch()}>
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
        </div>
      ) : null}
    </details>
  );
}
