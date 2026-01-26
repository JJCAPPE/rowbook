import type { ButtonProps as HeroButtonProps } from "@heroui/react";
import { Button as HeroButton } from "@heroui/react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const variantMap: Record<
  ButtonVariant,
  {
    color: HeroButtonProps["color"];
    variant: HeroButtonProps["variant"];
  }
> = {
  primary: { color: "primary", variant: "solid" },
  secondary: { color: "secondary", variant: "solid" },
  ghost: { color: "primary", variant: "light" },
  outline: { color: "primary", variant: "bordered" },
};

type ButtonProps = Omit<HeroButtonProps, "color" | "variant" | "size"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  download?: boolean | string;
};

export const Button = ({
  className,
  variant = "primary",
  size = "md",
  type,
  ...props
}: ButtonProps) => {
  const resolvedProps = props.as ? props : { ...props, type: type ?? "button" };
  const needsContrast = variant === "primary" || variant === "secondary";

  return (
    <HeroButton
      size={size}
      color={variantMap[variant].color}
      variant={variantMap[variant].variant}
      className={[needsContrast ? "text-white" : null, className].filter(Boolean).join(" ")}
      {...resolvedProps}
    />
  );
};
