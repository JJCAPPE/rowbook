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

const schema = z.object({
  activityType: z.enum(ActivityTypeValues),
  date: z.string().min(1, "Select a date"),
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
  date: new Date().toISOString().slice(0, 10),
  minutes: 30,
  distanceKm: 5,
  avgHr: undefined,
  notes: "",
  proof: null,
};

export const LogWorkoutForm = () => {
  const [submitted, setSubmitted] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

      const uploadResponse = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to upload proof image.");
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

      reset(defaultValues);
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

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" {...register("date")} />
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

      <div className="space-y-3">
        <Label htmlFor="proof">Proof image</Label>
        <Input
          id="proof"
          type="file"
          accept="image/*"
          {...register("proof")}
          className="file:mr-4 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
        />
        {errors.proof ? <p className="text-xs text-rose-500">{errors.proof.message}</p> : null}
        {previewUrl ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <img src={previewUrl} alt="Proof preview" className="h-40 w-full rounded-lg object-cover" />
          </div>
        ) : (
          <p className="text-xs text-slate-500">Upload a photo or screenshot of your workout.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Submit workout"}
        </Button>
        <p className="text-xs text-slate-500">Entries lock every Sunday at 6:00 PM ET.</p>
      </div>

      {submitError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {submitError}
        </div>
      ) : null}
      {submitted ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Workout saved. Status set to Not checked until proof review runs.
        </div>
      ) : null}
    </form>
  );
};
