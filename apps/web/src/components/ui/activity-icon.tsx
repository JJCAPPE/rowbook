import { ActivityType } from "@rowbook/shared";
import { Bike, Dumbbell, Footprints, Sparkles, Waves } from "lucide-react";

import { cn } from "@/lib/utils";

const iconMap = {
  ERG: Dumbbell,
  RUN: Footprints,
  CYCLE: Bike,
  SWIM: Waves,
  OTHER: Sparkles,
} as const;

type ActivityIconProps = {
  type: ActivityType;
  className?: string;
};

export const ActivityIcon = ({ type, className }: ActivityIconProps) => {
  const Icon = iconMap[type] ?? Sparkles;
  return <Icon className={cn("h-4 w-4 text-slate-600", className)} aria-hidden />;
};
