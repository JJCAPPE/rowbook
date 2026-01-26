import { WeekSelector } from "@/components/ui/week-selector";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type WeekOption = {
  key: string;
  label: string;
};

type TopBarProps = {
  title: string;
  userName: string;
  weekOptions?: WeekOption[];
  activeWeekKey?: string;
  className?: string;
};

export const TopBar = ({
  title,
  userName,
  weekOptions,
  activeWeekKey,
  className,
}: TopBarProps) => (
  <div
    className={cn(
      "sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-divider/40 bg-content1/80 px-4 py-4 backdrop-blur-xl md:px-8",
      className,
    )}
  >
    <div>
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-default-500">
        {title}
      </p>
      <p className="font-display text-lg font-semibold text-foreground">Week overview</p>
    </div>
    <div className="flex items-center gap-4">
      {weekOptions?.length ? (
        <WeekSelector weeks={weekOptions} value={activeWeekKey ?? weekOptions[0].key} />
      ) : null}
      <Avatar name={userName} />
    </div>
  </div>
);
