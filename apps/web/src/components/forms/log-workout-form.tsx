"use client";

import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ACTIVITY_TYPE_LABELS,
  ActivityTypeValues,
  extractProofFieldsFromText,
  shouldAutoVerifyProof,
  type ProofExtractedFields,
} from "@rowbook/shared";
import { createWorker } from "tesseract.js";

import { ActivityIcon } from "@/components/ui/activity-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ui/pill";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().positive().optional(),
);

const getTodayString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const schema = z.object({
  activityType: z.enum(ActivityTypeValues),
  date: z
    .string()
    .min(1, "Select a date")
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Select a valid date")
    .refine((value) => value <= getTodayString(), "Date cannot be in the future"),
  minutes: z.coerce.number().min(1, "Enter minutes"),
  distanceKm: z.coerce.number().nonnegative().min(0.1, "Enter distance"),
  avgHr: optionalNumber,
  notes: z.string().max(280).optional(),
  proof: z
    .custom<FileList | null>()
    .refine((files) => files && files.length > 0, "Proof image is required"),
});

type FormValues = z.infer<typeof schema>;

type OcrResult = {
  extractedFields: ProofExtractedFields;
  hasAny: boolean;
  hasRequired: boolean;
};

type OcrRunResult = {
  result: OcrResult | null;
  error: string | null;
};

const defaultValues: FormValues = {
  activityType: "ERG",
  date: getTodayString(),
  minutes: 30,
  distanceKm: 5,
  avgHr: undefined,
  notes: "",
  proof: null,
};

const uploadFileWithProgress = (
  url: string,
  file: File,
  onProgress: (value: number) => void,
) =>
  new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total === 0) {
        return;
      }
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(Math.min(Math.max(percent, 0), 100));
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error("Failed to upload proof image."));
    });

    request.addEventListener("error", () => {
      reject(new Error("Failed to upload proof image."));
    });

    request.addEventListener("abort", () => {
      reject(new Error("Upload cancelled."));
    });

    request.send(file);
  });

const parseNumberValue = (value: unknown) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const LogWorkoutForm = () => {
  const [submitted, setSubmitted] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [proofInputKey, setProofInputKey] = useState(0);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrPhase, setOcrPhase] = useState<string | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const ocrRunIdRef = useRef(0);
  const ocrFileRef = useRef<File | null>(null);
  const ocrPromiseRef = useRef<Promise<OcrRunResult> | null>(null);
  const ocrWorkerRef = useRef<Awaited<ReturnType<typeof createWorker>> | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const today = getTodayString();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const utils = trpc.useUtils();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { mutateAsync: createUploadUrl } = trpc.proof.createUploadUrl.useMutation();
  const { mutateAsync: confirmUpload } = trpc.proof.confirmUpload.useMutation();
  const { mutateAsync: createEntry } = trpc.athlete.createEntry.useMutation();

  const proof = watch("proof");
  const activityType = watch("activityType");
  const watchedDate = watch("date");
  const watchedMinutes = watch("minutes");
  const watchedDistance = watch("distanceKm");
  const watchedAvgHr = watch("avgHr");
  const proofRegister = register("proof");

  const terminateOcrWorker = useCallback(async () => {
    if (!ocrWorkerRef.current) {
      return;
    }
    try {
      await ocrWorkerRef.current.terminate();
    } catch {
      // Ignore termination errors for stale workers.
    } finally {
      ocrWorkerRef.current = null;
    }
  }, []);

  const runOcr = useCallback(async (file: File): Promise<OcrRunResult> => {
    const runId = ocrRunIdRef.current + 1;
    ocrRunIdRef.current = runId;

    await terminateOcrWorker();

    setOcrStatus("running");
    setOcrProgress(0);
    setOcrPhase("Preparing OCR...");
    setOcrError(null);
    setOcrResult(null);
    ocrFileRef.current = file;

    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
    try {
      worker = await createWorker("eng", 1, {
        logger: (message) => {
          if (ocrRunIdRef.current !== runId) {
            return;
          }
          if (typeof message.progress === "number") {
            const percent = Math.round(message.progress * 100);
            setOcrProgress(Math.min(Math.max(percent, 0), 100));
          }
          if (message.status) {
            setOcrPhase(message.status);
          }
        },
      });

      ocrWorkerRef.current = worker;
      const result = await worker.recognize(file);
      const text = result.data.text ?? "";
      const extraction = extractProofFieldsFromText(text);

      if (ocrRunIdRef.current !== runId) {
        return { result: null, error: null };
      }

      setOcrStatus("done");
      setOcrProgress(100);
      setOcrPhase("Done");
      setOcrResult(extraction);

      return { result: extraction, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR failed.";
      if (ocrRunIdRef.current === runId) {
        setOcrStatus("failed");
        setOcrError(message);
        setOcrPhase(null);
        setOcrProgress(0);
        setOcrResult(null);
      }
      return { result: null, error: message };
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // Ignore termination errors for stale workers.
        }
        if (ocrWorkerRef.current === worker) {
          ocrWorkerRef.current = null;
        }
      }
    }
  }, [terminateOcrWorker]);

  const ensureOcrResult = useCallback(async (file: File): Promise<OcrRunResult> => {
    if (ocrFileRef.current === file) {
      if (ocrStatus === "done" && ocrResult) {
        return { result: ocrResult, error: null };
      }
      if (ocrStatus === "failed") {
        return { result: null, error: ocrError };
      }
      if (ocrStatus === "running" && ocrPromiseRef.current) {
        return ocrPromiseRef.current;
      }
    }

    const promise = runOcr(file);
    ocrPromiseRef.current = promise;
    return promise;
  }, [ocrError, ocrResult, ocrStatus, runOcr]);

  const ocrSummary = (() => {
    if (!ocrResult) {
      return null;
    }

    if (!ocrResult.hasAny) {
      return {
        tone: "danger" as const,
        text: "OCR could not read workout data. We'll still submit for manual review.",
      };
    }

    const entryDate = new Date(watchedDate);
    const minutesValue = parseNumberValue(watchedMinutes);
    const distanceValue = parseNumberValue(watchedDistance);
    const avgHrValue = parseNumberValue(watchedAvgHr);
    if (Number.isNaN(entryDate.getTime()) || minutesValue === null || distanceValue === null) {
      return {
        tone: "info" as const,
        text: "OCR finished. Fill in your workout details to compare.",
      };
    }

    const autoVerified = shouldAutoVerifyProof(
      {
        date: entryDate,
        minutes: minutesValue,
        distance: distanceValue,
        avgHr: avgHrValue ?? null,
      },
      ocrResult.extractedFields,
    );

    if (autoVerified) {
      return {
        tone: "success" as const,
        text: "OCR matches your entry. We'll auto-verify on submit.",
      };
    }

    if (ocrResult.hasRequired) {
      return {
        tone: "info" as const,
        text: "OCR found workout data but it doesn't match. We'll submit for manual review.",
      };
    }

    return {
      tone: "info" as const,
      text: "OCR found partial data. We'll submit for manual review.",
    };
  })();

  useEffect(() => {
    if (!proof || proof.length === 0) {
      setPreviewUrl(null);
      return;
    }

    const file = proof[0];
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [proof]);

  useEffect(() => {
    if (!proof || proof.length === 0) {
      ocrRunIdRef.current += 1;
      ocrFileRef.current = null;
      ocrPromiseRef.current = null;
      setOcrStatus("idle");
      setOcrProgress(0);
      setOcrPhase(null);
      setOcrError(null);
      setOcrResult(null);
      void terminateOcrWorker();
      return;
    }

    const file = proof[0];
    const promise = runOcr(file);
    ocrPromiseRef.current = promise;

    return () => {
      ocrRunIdRef.current += 1;
      void terminateOcrWorker();
    };
  }, [proof, runOcr, terminateOcrWorker]);

  const onSubmit = async (values: FormValues) => {
    setSubmitted(false);
    setSubmitError(null);
    setIsUploading(false);
    setUploadProgress(0);

    const file = values.proof?.[0];
    if (!file) {
      setSubmitError("Proof image is required.");
      return;
    }

    try {
      const ocrPromise = ensureOcrResult(file);
      const upload = await createUploadUrl({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
      });

      setIsUploading(true);
      setUploadProgress(0);
      try {
        await uploadFileWithProgress(upload.uploadUrl, file, setUploadProgress);
      } finally {
        setIsUploading(false);
      }

      await confirmUpload({ proofImageId: upload.proofImageId });

      const ocrOutcome = await ocrPromise;
      const proofOcr = ocrOutcome.result || ocrOutcome.error
        ? {
            extractedFields: ocrOutcome.result?.extractedFields ?? null,
            error: ocrOutcome.error ?? null,
          }
        : undefined;

      await createEntry({
        activityType: values.activityType,
        date: new Date(values.date),
        minutes: values.minutes,
        distance: values.distanceKm,
        avgHr: values.avgHr ?? null,
        notes: values.notes?.trim() || undefined,
        proofImageId: upload.proofImageId,
        proofOcr,
      });

      await Promise.all([
        utils.athlete.getDashboard.invalidate(),
        utils.athlete.getHistory.invalidate(),
        utils.athlete.getWeekDetail.invalidate(),
        utils.coach.getReviewQueue.invalidate(),
        utils.coach.getTeamOverview.invalidate(),
      ]);

      reset({ ...defaultValues, date: getTodayString() });
      setPreviewUrl(null);
      setIsUploading(false);
      setUploadProgress(0);
      setProofInputKey((current) => current + 1);
      setSubmitted(true);
    } catch (error) {
      if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError("Unable to save entry. Please try again.");
      }
    }
  };

  const handleCameraChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files;
    if (!files || files.length === 0) {
      return;
    }
    setValue("proof", files, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-3">
        <Label>Activity type</Label>
        <div className="flex flex-wrap gap-2">
          {ActivityTypeValues.map((type) => (
            <Pill
              key={type}
              type="button"
              isActive={activityType === type}
              onClick={() => setValue("activityType", type, { shouldValidate: true })}
            >
              <ActivityIcon type={type} />
              {ACTIVITY_TYPE_LABELS[type]}
            </Pill>
          ))}
        </div>
        {errors.activityType ? (
          <p className="text-xs text-rose-500">{errors.activityType.message}</p>
        ) : null}
      </div>

      <div className="space-y-3">
        <Label htmlFor="proof">Proof of workout</Label>
        <input
          key={`camera-${proofInputKey}`}
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCameraChange}
          className="sr-only"
        />
        <input
          key={`upload-${proofInputKey}`}
          id="proof"
          type="file"
          accept="image/*"
          {...proofRegister}
          ref={(element) => {
            proofRegister.ref(element);
            uploadInputRef.current = element;
          }}
          className="sr-only"
        />
        <div className="flex flex-wrap justify-center items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (cameraInputRef.current) {
                cameraInputRef.current.value = "";
                cameraInputRef.current.click();
              }
            }}
          >
            Take photo of Screen
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => uploadInputRef.current?.click()}
          >
            Upload Screenshot
          </Button>
        </div>
        {errors.proof ? <p className="text-xs text-rose-500">{errors.proof.message}</p> : null}
        {previewUrl ? (
          <div className="rounded-2xl border border-divider/40 bg-content2/70 p-3">
            <img src={previewUrl} alt="Proof preview" className="h-40 w-full rounded-lg object-cover" />
          </div>
        ) : (
          <p className="text-xs text-default-500">Take a photo of your screen, or upload a screenshot from Strava, Garmin, Polar, etc.</p>
        )}
        {isUploading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-default-500">
              <span>Uploading proof</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-content2/70">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : null}
        {ocrStatus === "running" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-default-500">
              <span>Scanning proof</span>
              <span>{ocrProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-content2/70">
              <div
                className="h-full rounded-full bg-amber-400 transition-[width] duration-200"
                style={{ width: `${ocrProgress}%` }}
              />
            </div>
            {ocrPhase ? (
              <p className="text-xs text-default-500">{ocrPhase}</p>
            ) : null}
          </div>
        ) : null}
        {ocrStatus === "failed" ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            OCR failed. We will still submit for manual review.
            {ocrError ? ` (${ocrError})` : null}
          </div>
        ) : null}
        {ocrStatus === "done" && ocrSummary ? (
          <div
            className={`rounded-xl border px-4 py-3 text-xs ${
              ocrSummary.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : ocrSummary.tone === "danger"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-sky-200 bg-sky-50 text-sky-700"
            }`}
          >
            {ocrSummary.text}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" max={today} {...register("date")} />
          {errors.date ? <p className="text-xs text-rose-500">{errors.date.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="minutes">Minutes</Label>
          <Input id="minutes" type="number" min={1} {...register("minutes")} />
          {errors.minutes ? (
            <p className="text-xs text-rose-500">{errors.minutes.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="distanceKm">Distance (km)</Label>
          <Input id="distanceKm" type="number" step="0.1" {...register("distanceKm")} />
          {errors.distanceKm ? (
            <p className="text-xs text-rose-500">{errors.distanceKm.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="avgHr">Average HR</Label>
          <Input id="avgHr" type="number" min={30} max={220} {...register("avgHr")} />
          {errors.avgHr ? <p className="text-xs text-rose-500">{errors.avgHr.message}</p> : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" placeholder="Optional notes" {...register("notes")} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Submit workout"}
        </Button>
        <p className="text-xs text-default-500">Entries lock every Sunday at 6:00 PM ET.</p>
      </div>

      {submitError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitError}
        </div>
      ) : null}
      {submitted ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Workout saved. Counted toward totals while pending review.
        </div>
      ) : null}
    </form>
  );
};
