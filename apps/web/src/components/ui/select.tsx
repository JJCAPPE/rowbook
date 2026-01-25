import type { SelectHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = ({ className, ...props }: SelectProps) => (
  <select className={cn("input-field", className)} {...props} />
);
