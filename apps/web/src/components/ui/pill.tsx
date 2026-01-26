import type { ButtonProps as HeroButtonProps } from "@heroui/react";
import { Button as HeroButton } from "@heroui/react";

type PillProps = Omit<HeroButtonProps, "color" | "variant" | "size"> & {
  isActive?: boolean;
};

export const Pill = ({ className, isActive, type = "button", ...props }: PillProps) => {
  const color: HeroButtonProps["color"] = isActive ? "primary" : "default";

  return (
    <HeroButton
      type={type}
      size="sm"
      radius="full"
      color={color}
      variant={isActive ? "solid" : "bordered"}
      className={[
        "gap-2 text-xs font-semibold tracking-tight",
        isActive ? "text-white" : "text-default-500",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
};
