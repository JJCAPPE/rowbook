import type { ChipProps } from "@heroui/react";
import { Chip } from "@heroui/react";

import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "pending" | "success" | "danger" | "info";

const toneMap: Record<BadgeTone, ChipProps["color"]> = {
  neutral: "default",
  pending: "warning",
  success: "success",
  danger: "danger",
  info: "primary",
};

type BadgeProps = Omit<ChipProps, "color" | "variant" | "size"> & {
  tone?: BadgeTone;
};

export const Badge = ({ className, tone = "neutral", ...props }: BadgeProps) => (
  <Chip
    size="sm"
    variant="flat"
    color={toneMap[tone]}
    className={cn("text-xs font-semibold", className)}
    {...props}
  />
);
