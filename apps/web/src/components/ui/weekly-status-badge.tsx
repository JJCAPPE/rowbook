import { WeeklyStatus } from "@rowbook/shared";

import { Badge } from "@/components/ui/badge";

const WEEKLY_STATUS_UI: Record<WeeklyStatus, { label: string; tone: "neutral" | "success" | "danger" }> = {
  MET: { label: "Met", tone: "success" },
  NOT_MET: { label: "Not met", tone: "danger" },
  EXEMPT: { label: "Exempt", tone: "neutral" },
};

type WeeklyStatusBadgeProps = {
  status: WeeklyStatus;
};

export const WeeklyStatusBadge = ({ status }: WeeklyStatusBadgeProps) => {
  const ui = WEEKLY_STATUS_UI[status];
  return <Badge tone={ui.tone}>{ui.label}</Badge>;
};
