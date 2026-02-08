"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ACTIVITY_TYPE_LABELS,
  ActivityTypeValues,
} from "@rowbook/shared";

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
  distanceKm: z
    .coerce
    .number()
    .nonnegative()
    .min(0.1, "Enter distance")
    .max(500, "Distance looks too large. Enter kilometers (km), not meters (m)."),
  avgHr: optionalNumber,
  notes: z.string().max(280).optional(),
  proof: z.custom<FileList | null>().optional(), // Handled by separate state
  proofImageIds: z.array(z.string()).min(1, "At least one proof image is required"),
});

type FormValues = z.infer<typeof schema>;

type ExtractedProofFields = {
  date?: string | null;
  minutes?: number | null;
  distance?: number | null;
  avgHr?: number | null;
};


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

const parseNumberValue = (value: unknown) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const utils = trpc.useUtils();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { mutateAsync: createUploadUrl } = trpc.proof.createUploadUrl.useMutation();
  const { mutateAsync: confirmUpload } = trpc.proof.confirmUpload.useMutation();
  const { mutateAsync: extractFromProof } = trpc.proof.extractFromProof.useMutation();
  const { mutateAsync: createEntry } = trpc.athlete.createEntry.useMutation();

  const proof = watch("proof");
  const activityType = watch("activityType");
  const proofRegister = register("proof");
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  const [firstExtractedFields, setFirstExtractedFields] = useState<ExtractedProofFields | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<string | null>(null);

  const simulateProgress = (setProgress: (val: number | ((prev: number) => number)) => void) => {
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

  const applyExtractedFieldsToForm = (allExtractedFields: ExtractedProofFields[]) => {
    if (!allExtractedFields.length) {
      return;
    }

    const extractedDates = allExtractedFields
      .map((fields) => fields.date?.trim())
      .filter((date): date is string => Boolean(date));

    const uniqueDates = [...new Set(extractedDates)];
    const hasDateMismatch = uniqueDates.length > 1;

    if (hasDateMismatch) {
      setSubmitError("Uploaded proof images have different dates. Please verify your entry date manually.");
    } else if (uniqueDates[0]) {
      setValue("date", uniqueDates[0], { shouldValidate: true, shouldDirty: true });
    }

    const totalExtractedMinutes = allExtractedFields.reduce((total, fields) => {
      const numericMinutes = parseNumberValue(fields.minutes);
      return total + (numericMinutes ?? 0);
    }, 0);

    if (totalExtractedMinutes > 0) {
      setValue("minutes", Math.floor(totalExtractedMinutes), { shouldValidate: true, shouldDirty: true });
    }

    const firstDistance = allExtractedFields
      .map((fields) => parseNumberValue(fields.distance))
      .find((value): value is number => value !== null);
    if (firstDistance !== undefined) {
      setValue("distanceKm", firstDistance, { shouldValidate: true, shouldDirty: true });
    }

    const firstAvgHr = allExtractedFields
      .map((fields) => parseNumberValue(fields.avgHr))
      .find((value): value is number => value !== null);
    if (firstAvgHr !== undefined) {
      setValue("avgHr", firstAvgHr, { shouldValidate: true, shouldDirty: true });
    }
  };



  // Removed standard preview effect as we handle files manually now
  useEffect(() => {
    setValue("proofImageIds", uploadedIds, { shouldValidate: true });
  }, [uploadedIds, setValue]);


  const onSubmit = async (values: FormValues) => {
    setSubmitted(false);
    setSubmitError(null);
    setExtractionStatus(null);

    // We expect files to be already uploaded
    if (uploadedIds.length === 0) {
      setSubmitError("Please upload at least one proof image.");
      return;
    }

    setIsSaving(true);
    let progressInterval: NodeJS.Timeout | null = simulateProgress(setSaveProgress);

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
        proofOcr: firstExtractedFields ? { extractedFields: firstExtractedFields } : null,
      });

      if (progressInterval) clearInterval(progressInterval);
      progressInterval = null;
      setSaveProgress(100);
      // Brief delay to show 100%
      await new Promise(r => setTimeout(r, 400));

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
      setProofInputKey((current) => current + 1);
      setSubmitted(true);
    } catch (error) {
      if (error instanceof Error) {
        setSubmitError(error.message);
      } else {
        setSubmitError("Unable to save entry. Please try again.");
      }
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setIsSaving(false);
      setSaveProgress(0);
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setSubmitError(null);

    const newIds: string[] = [];
    const newUrls: string[] = [];
    const extractedResults: ExtractedProofFields[] = [];

    // Keep existing
    const currentIds = [...uploadedIds];
    const currentUrls = [...previewUrls];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Enhance preview
        newUrls.push(URL.createObjectURL(file));

        const upload = await createUploadUrl({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type as "image/jpeg" | "image/png" | "image/webp",
        });

        await uploadFileWithProgress(upload.uploadUrl, file, (progress) => {
          // Per-file progress logic if needed
          if (files.length === 1) setUploadProgress(progress);
        });

        await confirmUpload({ proofImageId: upload.proofImageId });
        newIds.push(upload.proofImageId);

        setIsExtracting(true);
        let extractInterval: NodeJS.Timeout | null = simulateProgress(setExtractionProgress);
        try {
          const extracted = await extractFromProof({ proofImageId: upload.proofImageId });
          extractedResults.push(extracted);
        } catch (e) {
          console.error("Extraction failed", e);
          setSubmitError("Auto-extraction failed for one or more images. Please enter details manually.");
        } finally {
          if (extractInterval) clearInterval(extractInterval);
          extractInterval = null;
          setExtractionProgress(100);
          await new Promise(r => setTimeout(r, 200));
          setIsExtracting(false);
          setExtractionProgress(0);
        }
      }

      if (extractedResults.length > 0) {
        setFirstExtractedFields(extractedResults[0] ?? null);
        applyExtractedFieldsToForm(extractedResults);
      }

      setUploadedIds([...currentIds, ...newIds]);
      setPreviewUrls([...currentUrls, ...newUrls]);

    } catch (e) {
      setSubmitError("Failed to upload image(s).");
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
        <Label htmlFor="proof">Proof of workout (select multiple if needed)</Label>
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

        {errors.proofImageIds ? <p className="text-xs text-rose-500">{errors.proofImageIds.message}</p> : null}
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
          <p className="text-xs text-default-500">Take photos of your screen, or upload screenshots from Strava, Garmin, Polar, etc.</p>
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
          <Input id="distanceKm" type="number" step="0.1" max={500} {...register("distanceKm")} />
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
        <p className="text-xs text-default-500">Entries lock every Sunday at 6:00 PM ET.</p>
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
