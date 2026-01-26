import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  <Card className={cn("flex flex-col items-start gap-3", className)}>
    <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
    <p className="text-sm text-default-500">{description}</p>
    {actionLabel ? (
      <Button type="button" variant="outline" size="sm" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null}
  </Card>
);
