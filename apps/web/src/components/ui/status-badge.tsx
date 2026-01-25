import { VALIDATION_STATUS_UI, ValidationStatus } from "@rowbook/shared";

import { Badge } from "@/components/ui/badge";

type StatusBadgeProps = {
  status: ValidationStatus;
};

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const ui = VALIDATION_STATUS_UI[status];
  return <Badge tone={ui.tone}>{ui.label}</Badge>;
};
