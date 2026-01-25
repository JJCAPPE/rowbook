import { WeeklyStatus } from "@rowbook/shared";

export const weeklyStatusStyles: Record<WeeklyStatus, string> = {
  MET: "bg-emerald-50 border-emerald-200",
  NOT_MET: "bg-rose-50 border-rose-200",
  EXEMPT: "bg-slate-100 border-slate-200",
};

export const weeklyStatusLabel: Record<WeeklyStatus, string> = {
  MET: "Met requirement",
  NOT_MET: "Not met",
  EXEMPT: "Exempt",
};
