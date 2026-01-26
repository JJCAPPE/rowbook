"use client";

import type { ChangeEvent } from "react";

import { cn } from "@/lib/utils";

type WeekOption = {
  key: string;
  label: string;
};

type WeekSelectorProps = {
  weeks: WeekOption[];
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
};

export const WeekSelector = ({ weeks, value, onChange, className }: WeekSelectorProps) => {
  const selectProps = onChange
    ? { value: value ?? weeks[0]?.key, onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value) }
    : { defaultValue: value ?? weeks[0]?.key };

  return (
    <select
      className={cn(
        "input-field w-auto rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-default-500 sm:px-4 sm:tracking-[0.2em]",
        className,
      )}
      {...selectProps}
    >
      {weeks.map((week) => (
        <option key={week.key} value={week.key}>
          {week.label}
        </option>
      ))}
    </select>
  );
};
