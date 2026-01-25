import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "pending" | "success" | "danger" | "info";

const toneStyles: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  pending: "bg-amber-100 text-amber-700",
  success: "bg-emerald-100 text-emerald-700",
  danger: "bg-rose-100 text-rose-700",
  info: "bg-sky-100 text-sky-700",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export const Badge = ({ className, tone = "neutral", ...props }: BadgeProps) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
      toneStyles[tone],
      className,
    )}
    {...props}
  />
);
