"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ACTIVITY_TYPE_LABELS,
  ActivityTypeValues,
  ProofExtractedFieldsSchema,
  formatInTimeZone,
} from "@rowbook/shared";

import { ActivityIcon } from "@/components/ui/activity-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ui/pill";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { getExtractedMinutes } from "@/lib/proof-field-comparison";

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.coerce.number().int().positive().nullable().optional(),
);

const schema = z
  .object({
    activityType: z.enum(ActivityTypeValues),
    date: z.string().min(1, "Select a date"),
    minutes: z.coerce.number().int().min(1, "Enter minutes"),
    distanceKm: z.coerce
      .number()
      .nonnegative()
      .max(
        500,
        "Distance looks too large. Enter kilometers (km), not meters (m).",
      ),
    avgHr: optionalNumber,
    notes: z.string().max(1000).nullable().optional(),
  })
  .superRefine((values, context) => {
    if (values.activityType !== "OTHER" && values.distanceKm < 0.001) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["distanceKm"],
        message: "Enter distance",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

type EditWorkoutFormProps = {
  entry: {
    id: string;
    version: number;
    activityType: (typeof ActivityTypeValues)[number];
    date: Date;
    minutes: number;
    distance: number;
    avgHr: number | null;
    notes: string | null;
    extractedFields?: unknown;
  };
  onSuccess: () => Promise<void> | void;
  onCancel: () => void;
};

const toDateInputValue = (value: Date) => formatInTimeZone(value);

const getTodayString = () => formatInTimeZone(new Date());

export function EditWorkoutForm({
  entry,
  onSuccess,
  onCancel,
}: EditWorkoutFormProps) {
  const utils = trpc.useUtils();
  const today = getTodayString();

  const defaultValues = useMemo<FormValues>(
    () => ({
      activityType: entry.activityType,
      date: toDateInputValue(new Date(entry.date)),
      minutes: entry.minutes,
      distanceKm: entry.distance,
      avgHr: entry.avgHr ?? null,
      notes: entry.notes ?? "",
    }),
    [entry],
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const { mutateAsync: updateEntry } = trpc.athlete.updateEntry.useMutation();
  const activityType = watch("activityType");
  const enteredMinutes = watch("minutes");
  const parsedProof = ProofExtractedFieldsSchema.safeParse(entry.extractedFields);
  const supportedMinutes = parsedProof.success
    ? getExtractedMinutes(parsedProof.data)
    : null;

  const onSubmit = async (values: FormValues) => {
    try {
      await updateEntry({
        id: entry.id,
        expectedVersion: entry.version,
        activityType: values.activityType,
        date: values.date as unknown as Date,
        minutes: values.minutes,
        distance: values.distanceKm,
        avgHr: values.avgHr ?? null,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      });

      await Promise.all([
        utils.athlete.getDashboard.invalidate(),
        utils.athlete.getHistory.invalidate(),
        utils.athlete.getHistoryWithEntries.invalidate(),
        utils.athlete.getWeekDetail.invalidate(),
        utils.athlete.getLeaderboard.invalidate(),
        utils.coach.getReviewQueue.invalidate(),
        utils.coach.getTeamOverview.invalidate(),
      ]);

      await onSuccess();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update entry.";
      setError("root", { message });
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
      <p className="text-xs text-default-500">
        Fields are required unless marked optional.
      </p>
      <fieldset className="space-y-3" disabled={isSubmitting}>
        <legend className="text-sm font-medium text-foreground">
          Activity type
        </legend>
        <div className="flex flex-wrap gap-2">
          {ActivityTypeValues.map((type) => (
            <Pill
              key={type}
              type="button"
              isActive={activityType === type}
              aria-pressed={activityType === type}
              onClick={() =>
                setValue("activityType", type, { shouldValidate: true })
              }
            >
              <ActivityIcon type={type} />
              {ACTIVITY_TYPE_LABELS[type]}
            </Pill>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-date">Date</Label>
          <Input
            id="edit-date"
            type="date"
            max={today}
            required
            disabled={isSubmitting}
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? "edit-date-error" : undefined}
            {...register("date")}
          />
          {errors.date ? (
            <p id="edit-date-error" role="alert" className="text-xs text-rose-600">
              {errors.date.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-minutes">Minutes</Label>
          <Input
            id="edit-minutes"
            type="number"
            min={1}
            inputMode="numeric"
            required
            disabled={isSubmitting}
            aria-invalid={errors.minutes ? true : undefined}
            aria-describedby={errors.minutes ? "edit-minutes-error" : undefined}
            {...register("minutes")}
          />
          {errors.minutes ? (
            <p id="edit-minutes-error" role="alert" className="text-xs text-rose-600">
              {errors.minutes.message}
            </p>
          ) : null}
          {supportedMinutes !== null ? (
            <div className="space-y-2 text-xs text-default-500">
              <p>
                The photo supports up to {supportedMinutes} whole active minutes.
                Saving changes checks the workout again.
              </p>
              {supportedMinutes > 0 && enteredMinutes > supportedMinutes ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting}
                  onPress={() =>
                    setValue("minutes", supportedMinutes, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                >
                  Use {supportedMinutes} minutes
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-distance">
            Distance (km){activityType === "OTHER" ? " (optional)" : ""}
          </Label>
          <Input
            id="edit-distance"
            type="number"
            min={activityType === "OTHER" ? 0 : 0.001}
            step="0.001"
            max={500}
            inputMode="decimal"
            required={activityType !== "OTHER"}
            disabled={isSubmitting}
            aria-invalid={errors.distanceKm ? true : undefined}
            aria-describedby={errors.distanceKm ? "edit-distance-error" : undefined}
            {...register("distanceKm")}
          />
          {errors.distanceKm ? (
            <p id="edit-distance-error" role="alert" className="text-xs text-rose-600">
              {errors.distanceKm.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-hr">Average HR (optional)</Label>
          <Input
            id="edit-hr"
            type="number"
            min={30}
            max={220}
            inputMode="numeric"
            disabled={isSubmitting}
            aria-invalid={errors.avgHr ? true : undefined}
            aria-describedby={errors.avgHr ? "edit-hr-error" : undefined}
            {...register("avgHr")}
          />
          {errors.avgHr ? (
            <p id="edit-hr-error" role="alert" className="text-xs text-rose-600">
              {errors.avgHr.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-notes">Notes (optional)</Label>
        <Textarea
          id="edit-notes"
          placeholder="Optional notes"
          maxLength={1000}
          disabled={isSubmitting}
          aria-invalid={errors.notes ? true : undefined}
          aria-describedby={
            errors.notes ? "edit-notes-hint edit-notes-error" : "edit-notes-hint"
          }
          {...register("notes")}
        />
        <p id="edit-notes-hint" className="text-xs text-default-500">
          Up to 1,000 characters.
        </p>
        {errors.notes ? (
          <p id="edit-notes-error" role="alert" className="text-xs text-rose-600">
            {errors.notes.message}
          </p>
        ) : null}
      </div>

      {errors.root?.message ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {errors.root.message}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onPress={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
