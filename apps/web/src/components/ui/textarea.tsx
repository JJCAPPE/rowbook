import { forwardRef } from "react";
import type { TextAreaProps as HeroTextAreaProps } from "@heroui/react";
import { Textarea as HeroTextarea } from "@heroui/react";

type TextareaProps = Omit<HeroTextAreaProps, "classNames"> & {
  className?: string;
  classNames?: HeroTextAreaProps["classNames"];
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, classNames, ...props }, ref) => (
    <HeroTextarea
      {...props}
      ref={ref}
      variant="bordered"
      radius="lg"
      className={className}
      classNames={classNames}
    />
  ),
);

Textarea.displayName = "Textarea";
