"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatShortDate } from "@/lib/format";
import { getWeeklyTargetsDraftStorageKey } from "@/lib/session-storage";
import { getWeekOptionsRefreshDelay } from "@/lib/week-options";
import { getWeekEndAt, getWeekStartAt } from "@rowbook/shared";

type WeeklyTarget = {
  weekStartAt: Date;
  requiredMinutes: string;
  originalMinutes: number; // To track dirty state
};

interface WeeklyTargetsTableProps {
  teamId: string;
  className?: string;
  onDirtyChange?: (isDirty: boolean) => void;
}

const isWeeklyTargetDirty = (week: WeeklyTarget) =>
  week.requiredMinutes !== String(week.originalMinutes);

const readStoredDrafts = (storageKey: string) => {
  try {
    const value: unknown = JSON.parse(
      window.sessionStorage.getItem(storageKey) ?? "null",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[1].length <= 20,
      ),
    );
  } catch {
    window.sessionStorage.removeItem(storageKey);
    return {};
  }
};

function advanceWeek(date: Date, weeks: number): Date {
  let result = getWeekStartAt(date);
  for (let index = 0; index < weeks; index += 1) {
    result = getWeekEndAt(result);
  }
  return result;
}

export function WeeklyTargetsTable({
  teamId,
  className,
  onDirtyChange,
}: WeeklyTargetsTableProps) {
  const [weeks, setWeeks] = useState<WeeklyTarget[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startAt, setStartAt] = useState(() => getWeekStartAt(new Date()));
  const hasChangesRef = useRef(false);
  const draftContextRef = useRef<string | null>(null);
  const utils = trpc.useUtils();

  const endAt = useMemo(() => advanceWeek(startAt, 6), [startAt]);
  const storageKey = useMemo(
    () => getWeeklyTargetsDraftStorageKey(teamId, startAt),
    [startAt, teamId],
  );

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      if (hasChangesRef.current) return;
      const current = getWeekStartAt(new Date());
      setStartAt((previous) =>
        previous.getTime() === current.getTime() ? previous : current,
      );
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, getWeekOptionsRefreshDelay());
    };
    const handleVisibility = () => {
      if (!document.hidden) {
        refresh();
        schedule();
      }
    };

    schedule();
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const { data, isLoading, error, refetch } =
    trpc.coach.getWeeklyRequirementsRange.useQuery({
      teamId,
      startAt,
      endAt,
    });

  useEffect(() => {
    if (!data) return;

    const contextKey = `${teamId}:${startAt.toISOString()}`;
    const preserveCurrent = draftContextRef.current === contextKey;
    const storedDrafts = readStoredDrafts(storageKey);

    setWeeks((current) => {
      const currentByWeek = new Map(
        preserveCurrent
          ? current.map((week) => [platformDate(week.weekStartAt), week])
          : [],
      );

      return Array.from({ length: 6 }, (_, index) => {
        const weekStartAt = advanceWeek(startAt, index);
        const weekKey = platformDate(weekStartAt);
        const existing = data.find(
          (requirement) =>
            new Date(requirement.weekStartAt).getTime() ===
            weekStartAt.getTime(),
        );
        const originalMinutes = existing?.requiredMinutes ?? 0;
        const currentWeek = currentByWeek.get(weekKey);

        return {
          weekStartAt,
          originalMinutes,
          requiredMinutes:
            currentWeek && isWeeklyTargetDirty(currentWeek)
              ? currentWeek.requiredMinutes
              : (storedDrafts[weekKey] ?? String(originalMinutes)),
        };
      });
    });
    draftContextRef.current = contextKey;
  }, [data, startAt, storageKey, teamId]);

  const { mutateAsync: saveRequirements, isLoading: isSaving } =
    trpc.coach.setWeeklyRequirements.useMutation({
      onSuccess: () => {
        utils.coach.getWeeklyRequirementsRange.invalidate();
        utils.coach.getWeeklySettings.invalidate();
        utils.coach.getTeamOverview.invalidate();
      },
    });

  const handleMinuteChange = (index: number, value: string) => {
    setSaveError(null);
    setWeeks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], requiredMinutes: value };
      return next;
    });
  };

  const handleSave = async () => {
    setSaveError(null);
    const requirements = weeks.map((week) => ({
      weekStartAt: week.weekStartAt,
      requiredMinutes: Number(week.requiredMinutes),
      valid:
        /^\d+$/.test(week.requiredMinutes) &&
        Number(week.requiredMinutes) <= 10_080,
    }));
    if (requirements.some((requirement) => !requirement.valid)) {
      setSaveError("Enter whole minutes from 0 to 10,080 for every week.");
      return;
    }
    try {
      await saveRequirements({
        teamId,
        requirements: requirements.map((requirement) => ({
          weekStartAt: requirement.weekStartAt,
          requiredMinutes: requirement.requiredMinutes,
        })),
      });
      setWeeks((current) =>
        current.map((week) => ({
          ...week,
          requiredMinutes: String(Number(week.requiredMinutes)),
          originalMinutes: Number(week.requiredMinutes),
        })),
      );
      window.sessionStorage.removeItem(storageKey);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Weekly targets were not saved. Try again.",
      );
    }
  };

  const hasChanges = weeks.some(isWeeklyTargetDirty);

  useEffect(() => {
    if (weeks.length === 0) return;

    hasChangesRef.current = hasChanges;
    onDirtyChange?.(hasChanges);
    if (!hasChanges) {
      window.sessionStorage.removeItem(storageKey);
      return;
    }

    const storedDrafts = Object.fromEntries(
      weeks
        .filter(isWeeklyTargetDirty)
        .map((week) => [platformDate(week.weekStartAt), week.requiredMinutes]),
    );
    window.sessionStorage.setItem(storageKey, JSON.stringify(storedDrafts));
  }, [hasChanges, onDirtyChange, storageKey, weeks]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange],
  );

  const discardChanges = () => {
    setSaveError(null);
    setWeeks((current) =>
      current.map((week) => ({
        ...week,
        requiredMinutes: String(week.originalMinutes),
      })),
    );
  };

  if (isLoading && weeks.length === 0) {
    return (
      <div className="p-4 text-sm text-default-500">Loading schedule...</div>
    );
  }

  if (error && weeks.length === 0) {
    return (
      <Card className="space-y-3" role="alert">
        <p className="text-sm text-rose-600">
          Weekly targets could not be loaded.
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <Card className={`overflow-hidden p-0${className ? ` ${className}` : ""}`}>
      <div className="p-4 border-b border-divider">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold">Weekly targets</h3>
            <p className="text-sm text-default-500">
              Set minutes for the upcoming 6 weeks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges ? (
              <Button
                size="sm"
                variant="outline"
                disabled={isSaving}
                onClick={discardChanges}
              >
                Discard
              </Button>
            ) : null}
            <Button
              size="sm"
              disabled={!hasChanges || isSaving}
              onClick={handleSave}
            >
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </div>
        {saveError ? (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {saveError}
          </p>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-default-50 text-default-500">
            <tr>
              <th className="px-4 py-3 font-medium">Week</th>
              <th className="px-4 py-3 font-medium">Target minutes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {weeks.map((week, index) => {
              const isCurrentWeek = index === 0;
              return (
                <tr
                  key={platformDate(week.weekStartAt)}
                  className={isCurrentWeek ? "bg-primary-50/10" : ""}
                >
                  <td className="px-4 py-3 align-middle">
                    <div className="font-medium">
                      {formatShortDate(week.weekStartAt)} -{" "}
                      {formatShortDate(getWeekEndAt(week.weekStartAt))}
                      {isCurrentWeek && (
                        <span className="ml-2 text-xs font-bold text-primary uppercase tracking-wider">
                          {" "}
                          [Current]
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Input
                      type="number"
                      min="0"
                      max="10080"
                      step="1"
                      inputMode="numeric"
                      className="max-w-[120px] input-no-spinner"
                      aria-label={`Target minutes for the week of ${formatShortDate(week.weekStartAt)}`}
                      value={week.requiredMinutes}
                      onChange={(e) =>
                        handleMinuteChange(index, e.target.value)
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Helper to avoid hydration mismatch with Date.toString across server/client if needed,
// but here we just need a unique key.
function platformDate(date: Date) {
  return date.toISOString().split("T")[0];
}
