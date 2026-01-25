import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-blue-700",
  secondary: "bg-ink text-white hover:bg-slate-900",
  ghost: "bg-transparent text-ink hover:bg-slate-100",
  outline: "border border-slate-200 text-ink hover:bg-slate-50",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = ({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) => (
  <button
    type={type}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
      variantStyles[variant],
      sizeStyles[size],
      className,
    )}
    {...props}
  />
);
