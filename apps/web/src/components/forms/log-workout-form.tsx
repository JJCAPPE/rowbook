"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ACTIVITY_TYPE_LABELS,
  ActivityTypeValues,
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  type ProofExtractedFields,
} from "@rowbook/shared";

import { ActivityIcon } from "@/components/ui/activity-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ui/pill";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getWorkoutUploadErrorMessage } from "@/lib/workout-upload-errors";

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
    .refine(
      (value) => !Number.isNaN(new Date(value).getTime()),
      "Select a valid date",
    )
    .refine(
      (value) => value <= getTodayString(),
      "Date cannot be in the future",
    ),
  minutes: z.coerce.number().min(1, "Enter minutes"),
  distanceKm: z.coerce
    .number()
    .nonnegative()
    .min(0.001, "Enter distance")
    .max(
      500,
      "Distance looks too large. Enter kilometers (km), not meters (m).",
    ),
  avgHr: optionalNumber,
  notes: z.string().max(280).optional(),
  proof: z.custom<FileList | null>().optional(), // Handled by separate state
  proofImageIds: z
    .array(z.string())
    .min(1, "At least one proof image is required"),
});

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
  activityType: "ERG",
  date: getTodayString(),
  minutes: 0,
  distanceKm: 0,
  avgHr: undefined,
  notes: "",
  proof: null,
  proofImageIds: [],
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

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const sanitizeExtractedFields = (value: unknown): ProofExtractedFields | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const sanitized: ProofExtractedFields = {};

  if (typeof source.date === "string") {
    const trimmedDate = source.date.trim();
    if (DATE_ONLY_PATTERN.test(trimmedDate)) {
      sanitized.date = trimmedDate;
    }
  }

  if (typeof source.minutes === "number" && Number.isFinite(source.minutes) && source.minutes > 0) {
    sanitized.minutes = Math.round(source.minutes);
  }

  if (
    typeof source.distance === "number" &&
    Number.isFinite(source.distance) &&
    source.distance > 0 &&
    source.distance <= 500
  ) {
    sanitized.distance = Number(source.distance.toFixed(3));
  }

  if (typeof source.avgHr === "number" && Number.isFinite(source.avgHr) && source.avgHr > 0) {
    sanitized.avgHr = Math.round(source.avgHr);
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
};

export const LogWorkoutForm = () => {
  const [submitted, setSubmitted] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [proofInputKey, setProofInputKey] = useState(0);
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
  const { mutateAsync: createUploadUrl } =
    trpc.proof.createUploadUrl.useMutation();
  const { mutateAsync: confirmUpload } = trpc.proof.confirmUpload.useMutation();
  const { mutateAsync: extractFromProof } =
    trpc.proof.extractFromProof.useMutation();
  const { mutateAsync: createEntry } = trpc.athlete.createEntry.useMutation();

  const activityType = watch("activityType");
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  const [firstExtractedFields, setFirstExtractedFields] =
    useState<ProofExtractedFields | null>(
      null,
    );

  const simulateProgress = (
    setProgress: (val: number | ((prev: number) => number)) => void,
  ) => {
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        // Slow down as it gets higher
        const increment = Math.max(1, (90 - prev) / 10);
        return Math.min(90, prev + increment);
      });
    }, 100);
    return interval;
  };

  // Removed standard preview effect as we handle files manually now
  useEffect(() => {
    setValue("proofImageIds", uploadedIds, { shouldValidate: true });
  }, [uploadedIds, setValue]);

  const onSubmit = async (values: FormValues) => {
    setSubmitted(false);
    setSubmitError(null);

    // We expect files to be already uploaded
    if (uploadedIds.length === 0) {
      setSubmitError("Please upload at least one proof image.");
      return;
    }

    setIsSaving(true);
    let progressInterval: NodeJS.Timeout | null =
      simulateProgress(setSaveProgress);

    try {
      await createEntry({
        activityType: values.activityType,
        // Pass date as string - the server-side schema properly parses it as New York noon
        // to avoid timezone issues (new Date("YYYY-MM-DD") interprets as UTC midnight,
        // which becomes the previous day in EST/EDT)
        date: values.date as unknown as Date,
        minutes: values.minutes,
        distance: values.distanceKm,
        avgHr: values.avgHr ?? null,
        notes: values.notes?.trim() || undefined,
        proofImageIds: uploadedIds,
        proofOcr: firstExtractedFields
          ? { extractedFields: firstExtractedFields }
          : null,
      });

      if (progressInterval) clearInterval(progressInterval);
      progressInterval = null;
      setSaveProgress(100);
      // Brief delay to show 100%
      await new Promise((r) => setTimeout(r, 400));

      await Promise.all([
        utils.athlete.getDashboard.invalidate(),
        utils.athlete.getHistory.invalidate(),
        utils.athlete.getWeekDetail.invalidate(),
        utils.coach.getReviewQueue.invalidate(),
        utils.coach.getTeamOverview.invalidate(),
      ]);

      reset({ ...defaultValues, date: getTodayString() });
      setPreviewUrls([]);
      setUploadedIds([]);
      setFirstExtractedFields(null);
      setProofInputKey((current) => current + 1);
      setSubmitted(true);
    } catch (error) {
      setSubmitError(getWorkoutUploadErrorMessage(error, "submit"));
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setIsSaving(false);
      setSaveProgress(0);
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setSubmitError(null);
    setFirstExtractedFields(null);

    const newIds: string[] = [];
    const newUrls: string[] = [];

    // Keep existing
    const currentIds = [...uploadedIds];
    const currentUrls = [...previewUrls];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
          throw new Error("File exceeds maximum size.");
        }

        const mimeType = file.type.toLowerCase();
        if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
          throw new Error("Unsupported file type.");
        }

        // Enhance preview
        newUrls.push(URL.createObjectURL(file));

        const upload = await createUploadUrl({
          fileName: file.name,
          fileSize: file.size,
          mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
        });

        await uploadFileWithProgress(upload.uploadUrl, file, (progress) => {
          // Per-file progress logic if needed
          if (files.length === 1) setUploadProgress(progress);
        });

        await confirmUpload({ proofImageId: upload.proofImageId });
        newIds.push(upload.proofImageId);

        // Trigger extraction for the first file only (or all and aggregate?)
        // Let's do first file for now to populate form
        if (i === 0) {
          setIsExtracting(true);
          let extractInterval: NodeJS.Timeout | null = simulateProgress(
            setExtractionProgress,
          );
          try {
            const extracted = await extractFromProof({
              proofImageId: upload.proofImageId,
            });
            const sanitizedExtracted = sanitizeExtractedFields(extracted);
            setFirstExtractedFields(sanitizedExtracted);

            if (sanitizedExtracted?.date) {
              setValue("date", sanitizedExtracted.date, {
                shouldValidate: true,
                shouldDirty: true,
              });
            }
            if (sanitizedExtracted?.minutes) {
              setValue("minutes", sanitizedExtracted.minutes, {
                shouldValidate: true,
                shouldDirty: true,
              });
            }
            if (sanitizedExtracted?.distance) {
              setValue("distanceKm", sanitizedExtracted.distance, {
                shouldValidate: true,
                shouldDirty: true,
              });
            }
            if (sanitizedExtracted?.avgHr) {
              setValue("avgHr", sanitizedExtracted.avgHr, {
                shouldValidate: true,
                shouldDirty: true,
              });
            }

            if (extractInterval) clearInterval(extractInterval);
            extractInterval = null;
            setExtractionProgress(100);
            await new Promise((r) => setTimeout(r, 400));
          } catch (error) {
            setSubmitError(getWorkoutUploadErrorMessage(error, "extract"));
          } finally {
            if (extractInterval) clearInterval(extractInterval);
            setIsExtracting(false);
            setExtractionProgress(0);
          }
        }
      }

      setUploadedIds([...currentIds, ...newIds]);
      setPreviewUrls([...currentUrls, ...newUrls]);
    } catch (error) {
      setSubmitError(getWorkoutUploadErrorMessage(error, "upload"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleCameraChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(event.currentTarget.files);
  };

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(event.currentTarget.files);
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
              onClick={() =>
                setValue("activityType", type, { shouldValidate: true })
              }
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
        <Label htmlFor="proof">
          Proof of workout (select multiple if needed)
        </Label>
        <input
          key={`camera-${proofInputKey}`}
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleCameraChange}
          className="sr-only"
        />
        <input
          key={`upload-${proofInputKey}`}
          id="proof"
          type="file"
          accept="image/*"
          multiple
          onChange={handleUploadChange}
          ref={(element) => {
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

        {errors.proofImageIds ? (
          <p className="text-xs text-rose-500">
            {errors.proofImageIds.message}
          </p>
        ) : null}
        {previewUrls.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 w-full rounded-2xl border border-divider/40 bg-content2/70 p-3">
            {previewUrls.map((url, index) => (
              <div key={index} className="relative aspect-video w-full">
                <Image
                  src={url}
                  alt={`Proof preview ${index + 1}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 300px"
                  className="rounded-lg object-cover"
                  unoptimized
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-default-500">
            Take photos of your screen, or upload screenshots from Strava,
            Garmin, Polar, etc.
          </p>
        )}

        {isUploading ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-default-500">
              <span>Step 1: Uploading proof</span>
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

        {isExtracting ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-default-500">
              <span>Step 2: Extracting data</span>
              <span>{Math.round(extractionProgress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-content2/70">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${extractionProgress}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" max={today} {...register("date")} />
          {errors.date ? (
            <p className="text-xs text-rose-500">{errors.date.message}</p>
          ) : null}
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
          <Input
            id="distanceKm"
            type="number"
            min={0.001}
            step="0.001"
            max={500}
            {...register("distanceKm")}
          />
          {errors.distanceKm ? (
            <p className="text-xs text-rose-500">{errors.distanceKm.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="avgHr">Average HR</Label>
          <Input
            id="avgHr"
            type="number"
            min={30}
            max={220}
            {...register("avgHr")}
          />
          {errors.avgHr ? (
            <p className="text-xs text-rose-500">{errors.avgHr.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Optional notes"
          {...register("notes")}
        />
      </div>

      {isSaving ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-default-500">
            <span>Step 3: Saving workout</span>
            <span>{Math.round(saveProgress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-content2/70">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${saveProgress}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Submit workout"}
        </Button>
        <p className="text-xs text-default-500">
          Entries lock every Sunday at 8:00 PM ET.
        </p>
      </div>

      {submitError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitError}
        </div>
      ) : null}
      {submitted ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Workout saved.
        </div>
      ) : null}
    </form>
  );
};
