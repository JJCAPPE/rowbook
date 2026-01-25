import { cn } from "@/lib/utils";

type AvatarProps = {
  name: string;
  className?: string;
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export const Avatar = ({ name, className }: AvatarProps) => (
  <div
    className={cn(
      "flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white",
      className,
    )}
  >
    {getInitials(name)}
  </div>
);
