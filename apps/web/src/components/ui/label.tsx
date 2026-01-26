import type { LabelHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export const Label = ({ className, ...props }: LabelProps) => (
  <label
    className={cn(
      "text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-default-400",
      className,
    )}
    {...props}
  />
);
