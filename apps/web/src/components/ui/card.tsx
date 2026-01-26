import type { ReactNode } from "react";
import type { CardProps as HeroCardProps } from "@heroui/react";
import { Card as HeroCard, CardBody } from "@heroui/react";

import { cn } from "@/lib/utils";

type CardProps = Omit<HeroCardProps, "children" | "className"> & {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
};

export const Card = ({
  className,
  containerClassName,
  children,
  ...props
}: CardProps) => (
  <HeroCard
    {...props}
    radius="lg"
    className={cn(
      "border border-divider/40 bg-content1/80 shadow-card backdrop-blur",
      containerClassName,
    )}
  >
    <CardBody className={cn("p-6", className)}>{children}</CardBody>
  </HeroCard>
);
