import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type FilterChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive?: boolean;
};

export const FilterChip = ({ className, isActive, type = "button", ...props }: FilterChipProps) => (
  <button
    type={type}
    className={cn(
      "rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
      isActive
        ? "border-ink bg-ink text-white"
        : "border-slate-200 bg-white text-slate-600",
      className,
    )}
    {...props}
  />
);
