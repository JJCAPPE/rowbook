"use client";

import { useMemo } from "react";
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
  (value) => (value === "" || value === null ? null : value),
  z.coerce.number().int().positive().nullable().optional(),
);

const schema = z.object({
  activityType: z.enum(ActivityTypeValues),
  date: z.string().min(1, "Select a date"),
  minutes: z.coerce.number().int().min(1, "Enter minutes"),
  distanceKm: z.coerce
    .number()
    .nonnegative()
    .min(0.001, "Enter distance")
    .max(
      500,
      "Distance looks too large. Enter kilometers (km), not meters (m).",
    ),
  avgHr: optionalNumber,
  notes: z.string().max(1000).nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

type EditWorkoutFormProps = {
  entry: {
    id: string;
    activityType: (typeof ActivityTypeValues)[number];
    date: Date;
    minutes: number;
    distance: number;
    avgHr: number | null;
    notes: string | null;
  };
  onSuccess: () => Promise<void> | void;
  onCancel: () => void;
};

const toDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getTodayString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function EditWorkoutForm({ entry, onSuccess, onCancel }: EditWorkoutFormProps) {
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

  const onSubmit = async (values: FormValues) => {
    try {
      await updateEntry({
        id: entry.id,
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
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="edit-date">Date</Label>
          <Input id="edit-date" type="date" max={today} {...register("date")} />
          {errors.date ? (
            <p className="text-xs text-rose-500">{errors.date.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-minutes">Minutes</Label>
          <Input id="edit-minutes" type="number" min={1} {...register("minutes")} />
          {errors.minutes ? (
            <p className="text-xs text-rose-500">{errors.minutes.message}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-distance">Distance (km)</Label>
          <Input
            id="edit-distance"
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
          <Label htmlFor="edit-hr">Average HR</Label>
          <Input id="edit-hr" type="number" min={30} max={220} {...register("avgHr")} />
          {errors.avgHr ? (
            <p className="text-xs text-rose-500">{errors.avgHr.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-notes">Notes</Label>
        <Textarea id="edit-notes" placeholder="Optional notes" {...register("notes")} />
      </div>

      {errors.root?.message ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
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
