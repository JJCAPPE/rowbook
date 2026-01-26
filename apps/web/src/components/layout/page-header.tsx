import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

export const PageHeader = ({ title, subtitle, actions, className }: PageHeaderProps) => (
  <div className={cn("flex flex-wrap items-center justify-between gap-4", className)}>
    <div>
      <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-default-500">{subtitle}</p> : null}
    </div>
    {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
  </div>
);
