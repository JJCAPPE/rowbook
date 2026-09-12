"use client";

import {
  ACTIVITY_TYPE_LABELS,
  ProofExtractedFieldsSchema,
  parseDateStringAsNewYorkNoon,
} from "@rowbook/shared";
import { formatFullDate, formatMinutes, formatDistance } from "@/lib/format";
import {
  compareProofFields,
  getExtractedMinutes,
  type EnteredWorkoutFields,
  type ProofComparisonStatus,
} from "@/lib/proof-field-comparison";

interface ProofExtractionFeedbackProps {
  fields: unknown;
  enteredFields?: EnteredWorkoutFields;
}

const statusStyles: Record<ProofComparisonStatus, string> = {
  matches: "border-emerald-200 bg-emerald-50/70 text-emerald-800",
  differs: "border-rose-200 bg-rose-50/80 text-rose-800",
  missing: "border-amber-200 bg-amber-50/80 text-amber-900",
};

const statusLabels: Record<ProofComparisonStatus, string> = {
  matches: "Matches",
  differs: "Different",
  missing: "Not read",
};

const formatDurationSeconds = (seconds: number) => {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  const parts = [
    hours ? `${hours}h` : null,
    minutes ? `${minutes}m` : null,
    remainder ? `${remainder}s` : null,
  ].filter(Boolean);
  return parts.join(" ") || "0s";
};

export function ProofExtractionFeedback({
  fields,
  enteredFields,
}: ProofExtractionFeedbackProps) {
  const parsed = ProofExtractedFieldsSchema.safeParse(fields);
  if (!parsed.success) return null;

  const data = parsed.data;
  const extractedMinutes = getExtractedMinutes(data);

  const extractedValues = {
    activityType: data.activityType
      ? ACTIVITY_TYPE_LABELS[data.activityType]
      : "Not read",
    date: data.date
      ? formatFullDate(parseDateStringAsNewYorkNoon(data.date))
      : "Not read",
    minutes:
      typeof data.durationSeconds === "number"
        ? formatDurationSeconds(data.durationSeconds)
        : extractedMinutes !== null
          ? formatMinutes(extractedMinutes)
          : "Not read",
    distance:
      typeof data.distance === "number"
        ? formatDistance(data.distance)
        : "Not read",
    avgHr: typeof data.avgHr === "number" ? `${data.avgHr} bpm` : "Not read",
  };

  if (enteredFields) {
    const statuses = compareProofFields(enteredFields, data);
    const items = [
      {
        key: "activityType" as const,
        label: "Activity",
        entered: ACTIVITY_TYPE_LABELS[enteredFields.activityType],
      },
      {
        key: "date" as const,
        label: "Date",
        entered: formatFullDate(enteredFields.date),
      },
      {
        key: "minutes" as const,
        label: "Minutes / duration",
        entered: formatMinutes(enteredFields.minutes),
      },
      {
        key: "distance" as const,
        label: "Distance",
        entered: formatDistance(enteredFields.distance),
      },
      {
        key: "avgHr" as const,
        label: "Average HR",
        entered:
          enteredFields.avgHr === null
            ? "Not entered"
            : `${enteredFields.avgHr} bpm`,
      },
    ];

    return (
      <section
        className="mt-2 overflow-hidden rounded-xl border border-divider/40 bg-content1/70"
        aria-label="Entered and photo values"
      >
        <div className="border-b border-divider/40 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-default-500">
            Entered vs photo
          </p>
        </div>
        <div className="grid grid-cols-[minmax(5.5rem,0.85fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-divider/30 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-default-400">
          <span>Field</span>
          <span>Entered</span>
          <span>Photo</span>
        </div>
        <div className="divide-y divide-divider/30">
          {items.map((item) => {
            const status = statuses[item.key];
            return (
              <div
                key={item.key}
                className="grid grid-cols-[minmax(5.5rem,0.85fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 px-3 py-2.5 text-xs"
              >
                <span className="font-medium text-default-500">
                  {item.label}
                </span>
                <span className="min-w-0 font-semibold text-foreground">
                  {item.entered}
                </span>
                <span
                  className={`min-w-0 rounded-lg border px-2 py-1.5 font-semibold ${statusStyles[status]}`}
                >
                  <span className="block break-words">
                    {extractedValues[item.key]}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-wide opacity-80">
                    {statusLabels[status]}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const items = [
    {
      label: "Activity",
      value: data.activityType ? ACTIVITY_TYPE_LABELS[data.activityType] : null,
      missing: !data.activityType,
    },
    {
      label: "Duration",
      value: extractedValues.minutes,
      missing: extractedMinutes === null,
    },
    {
      label: "Distance",
      value: extractedValues.distance,
      missing: typeof data.distance !== "number",
    },
    {
      label: "Avg HR",
      value: extractedValues.avgHr,
      missing: typeof data.avgHr !== "number",
    },
    {
      label: "Date",
      value: extractedValues.date,
      missing: !data.date
    },
  ];

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-divider/20 bg-gradient-to-br from-content1/50 to-content2/50 p-3 shadow-inner">
      <div className="flex items-center gap-2">
        <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-default-400">
          Photo values
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium uppercase tracking-tight text-default-400">
              {item.label}
            </span>
            {item.missing ? (
              <span className="text-xs font-semibold text-rose-500">Missing</span>
            ) : (
              <span className="text-xs font-semibold text-default-600">
                {item.value}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
