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
      "sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-100 bg-white/90 px-4 py-4 backdrop-blur md:px-8",
      className,
    )}
  >
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <p className="text-lg font-semibold text-ink">Week overview</p>
    </div>
    <div className="flex items-center gap-4">
      {weekOptions?.length ? (
        <WeekSelector weeks={weekOptions} value={activeWeekKey ?? weekOptions[0].key} />
      ) : null}
      <Avatar name={userName} />
    </div>
  </div>
);
