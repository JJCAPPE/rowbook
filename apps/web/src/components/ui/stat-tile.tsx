import { cn } from "@/lib/utils";

type StatTileProps = {
  label: string;
  value: string;
  helper?: string;
  className?: string;
};

export const StatTile = ({ label, value, helper, className }: StatTileProps) => (
  <div className={cn("card p-4", className)}>
    <p className="stat-label">{label}</p>
    <p className="stat-value">{value}</p>
    {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
  </div>
);
