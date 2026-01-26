import { Avatar as HeroAvatar } from "@heroui/react";

import { cn } from "@/lib/utils";

type AvatarProps = {
  name: string;
  className?: string;
};

export const Avatar = ({ name, className }: AvatarProps) => (
  <HeroAvatar
    name={name}
    showFallback
    className={cn("h-10 w-10 bg-content3 text-foreground", className)}
  />
);
