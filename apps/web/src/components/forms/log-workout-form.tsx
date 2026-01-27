"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ACTIVITY_TYPE_LABELS, ActivityTypeValues } from "@rowbook/shared";

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

export const LogWorkoutForm = () => {
  const [submitted, setSubmitted] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [proofInputKey, setProofInputKey] = useState(0);
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

      await createEntry({
        activityType: values.activityType,
        date: new Date(values.date),
        minutes: values.minutes,
        distance: values.distanceKm,
        avgHr: values.avgHr ?? null,
        notes: values.notes?.trim() || undefined,
        proofImageId: upload.proofImageId,
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
        <Label htmlFor="proof">Proof image</Label>
        <Input
          key={proofInputKey}
          id="proof"
          type="file"
          accept="image/*"
          {...register("proof")}
          className="file:mr-4 file:rounded-full file:border-0 file:bg-content2/70 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-default-500 hover:file:bg-content2"
        />
        {errors.proof ? <p className="text-xs text-rose-500">{errors.proof.message}</p> : null}
        {previewUrl ? (
          <div className="rounded-2xl border border-divider/40 bg-content2/70 p-3">
            <img src={previewUrl} alt="Proof preview" className="h-40 w-full rounded-lg object-cover" />
          </div>
        ) : (
          <p className="text-xs text-default-500">Upload a photo or screenshot of your workout.</p>
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
