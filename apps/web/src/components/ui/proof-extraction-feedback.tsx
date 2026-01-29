"use client";

import { ProofExtractedFields } from "@rowbook/shared";
import { formatFullDate, formatMinutes, formatDistance } from "@/lib/format";

interface ProofExtractionFeedbackProps {
  fields: any;
}

export function ProofExtractionFeedback({ fields }: ProofExtractionFeedbackProps) {
  if (!fields) return null;

  const data = fields as ProofExtractedFields;

  const items = [
    { label: "Activity", value: data.activityType },
    { 
      label: "Duration", 
      value: typeof data.minutes === "number" ? formatMinutes(data.minutes) : null 
    },
    { 
      label: "Distance", 
      value: typeof data.distance === "number" ? formatDistance(data.distance) : null 
    },
    { 
      label: "Avg HR", 
      value: typeof data.avgHr === "number" ? `${data.avgHr} bpm` : null 
    },
    { 
      label: "Date", 
      value: data.date ? formatFullDate(new Date(data.date)) : null 
    },
  ].filter((item) => item.value !== null && item.value !== undefined);

  if (items.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-divider/20 bg-gradient-to-br from-content1/50 to-content2/50 p-3 shadow-inner">
      <div className="flex items-center gap-2">
        <div className="h-1 w-1 rounded-full bg-primary animate-pulse" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-default-400">
          AI Extraction Result
        </p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="flex flex-col gap-0.5">
            <span className="text-[9px] font-medium uppercase tracking-tight text-default-400">
              {item.label}
            </span>
            <span className="text-xs font-semibold text-default-600">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
