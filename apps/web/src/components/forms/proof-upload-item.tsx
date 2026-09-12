"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, ImageIcon, Loader2, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  formatUploadBytes,
  type ProofUploadStatus,
} from "@/components/forms/proof-upload-client";

type ProofUploadItemProps = {
  name: string;
  previewUrl: string | null;
  status: ProofUploadStatus;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  error: string | null;
  retryable: boolean;
  actionsDisabled: boolean;
  onRetry: () => void;
  onRemove: () => void;
};

const statusLabel: Record<ProofUploadStatus, string> = {
  queued: "Waiting to upload",
  preparing: "Preparing photo",
  uploading: "Uploading photo",
  confirming: "Confirming upload",
  ready: "Photo uploaded",
  error: "Upload failed",
};

const LocalPreview = ({ previewUrl, name }: { previewUrl: string | null; name: string }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [previewUrl]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-content2">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-default-500">
        <ImageIcon aria-hidden="true" className="size-5" />
        <span className="text-[0.7rem] leading-tight">
          {previewUrl ? "Preparing preview" : "Previously uploaded"}
        </span>
      </div>
      {previewUrl && !failed ? (
        <Image
          key={previewUrl}
          src={previewUrl}
          alt={`Preview of ${name}`}
          fill
          sizes="(max-width: 640px) 88px, 112px"
          className="object-cover"
          unoptimized
          onError={() => setFailed(true)}
        />
      ) : null}
    </div>
  );
};

export const ProofUploadItem = ({
  name,
  previewUrl,
  status,
  progress,
  loadedBytes,
  totalBytes,
  error,
  retryable,
  actionsDisabled,
  onRetry,
  onRemove,
}: ProofUploadItemProps) => {
  const isBusy = ["queued", "preparing", "uploading", "confirming"].includes(status);
  const showProgress = status === "uploading";

  return (
    <li className="min-w-0 rounded-2xl border border-divider/40 bg-content2/55 p-3">
      <div className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
        <LocalPreview previewUrl={previewUrl} name={name} />
        <div className="flex min-w-0 flex-col justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-semibold text-foreground" title={name}>
              {name}
            </p>
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-default-600">
              {status === "ready" ? (
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
              ) : isBusy ? (
                <Loader2
                  aria-hidden="true"
                  className="size-4 shrink-0 animate-spin text-primary"
                />
              ) : null}
              <span>
                {statusLabel[status]}
                {showProgress ? ` — ${progress}%` : ""}
              </span>
            </div>
            {showProgress ? (
              <div className="space-y-1.5 pt-1">
                <div
                  role="progressbar"
                  aria-label={`Uploading ${name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  className="h-2 overflow-hidden rounded-full bg-content3"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-[0.7rem] text-default-500">
                  {formatUploadBytes(loadedBytes)} of {formatUploadBytes(totalBytes)}
                </p>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="break-words text-xs leading-relaxed text-rose-600">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {status === "error" && retryable ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11 px-3"
                disabled={actionsDisabled}
                onClick={onRetry}
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Retry
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-11 px-3"
              disabled={actionsDisabled}
              onClick={onRemove}
              aria-label={`${isBusy ? "Cancel" : "Remove"} ${name}`}
            >
              <X aria-hidden="true" className="size-4" />
              {isBusy ? "Cancel" : "Remove"}
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
};
