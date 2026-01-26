import { forwardRef } from "react";
import type { InputProps as HeroInputProps } from "@heroui/react";
import { Input as HeroInput } from "@heroui/react";

import { cn } from "@/lib/utils";

type InputProps = Omit<HeroInputProps, "classNames"> & {
  className?: string;
  classNames?: HeroInputProps["classNames"];
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, classNames, type, size, ...props }, ref) => {
    if (type === "file") {
      return (
        <input
          {...props}
          ref={ref}
          type={type}
          className={cn("input-field", className)}
        />
      );
    }

    return (
      <HeroInput
        {...props}
        ref={ref}
        type={type}
        size={size}
        variant="bordered"
        radius="lg"
        className={className}
        classNames={classNames}
      />
    );
  },
);

Input.displayName = "Input";
