import type { ButtonProps as HeroButtonProps } from "@heroui/react";
import { Button as HeroButton } from "@heroui/react";

type FilterChipProps = Omit<HeroButtonProps, "color" | "variant" | "size"> & {
  isActive?: boolean;
};

export const FilterChip = ({ className, isActive, type = "button", ...props }: FilterChipProps) => {
  const color: HeroButtonProps["color"] = isActive ? "secondary" : "default";

  return (
    <HeroButton
      type={type}
      aria-pressed={Boolean(isActive)}
      size="sm"
      radius="full"
      variant={isActive ? "solid" : "bordered"}
      color={color}
      className={[
        "touch-target h-auto min-h-8 max-w-full whitespace-normal py-1 text-xs font-semibold uppercase tracking-[0.2em] [overflow-wrap:anywhere]",
        isActive ? "text-white" : "text-default-500",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
};
