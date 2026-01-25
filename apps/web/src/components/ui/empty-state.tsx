import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export const EmptyState = ({
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) => (
  <div className={cn("card flex flex-col items-start gap-2 p-6", className)}>
    <h3 className="text-lg font-semibold text-ink">{title}</h3>
    <p className="text-sm text-slate-600">{description}</p>
    {actionLabel ? (
      <Button type="button" variant="outline" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null}
  </div>
);
