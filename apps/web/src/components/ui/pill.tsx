import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive?: boolean;
};

export const Pill = ({ className, isActive, type = "button", ...props }: PillProps) => (
  <button
    type={type}
    className={cn(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
      isActive
        ? "border-primary bg-blue-50 text-primary"
        : "border-slate-200 bg-white text-slate-600",
      className,
    )}
    {...props}
  />
);
