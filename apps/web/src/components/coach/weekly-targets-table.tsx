"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatShortDate } from "@/lib/format";
import { getWeekStartAt } from "@rowbook/shared";

type WeeklyTarget = {
    weekStartAt: Date;
    requiredMinutes: number;
    originalMinutes: number; // To track dirty state
};

interface WeeklyTargetsTableProps {
    teamId: string;
    className?: string;
}

// Simple helper to match date-fns addWeeks
function addWeeks(date: Date, weeks: number): Date {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + weeks * 7);
    return newDate;
}

export function WeeklyTargetsTable({ teamId, className }: WeeklyTargetsTableProps) {
    const [weeks, setWeeks] = useState<WeeklyTarget[]>([]);
    const utils = trpc.useUtils();

    // Calculate the 6-week range
    // We use the shared helper to ensure we align with backend's week definition
    const { startAt, endAt } = useMemo(() => {
        const start = getWeekStartAt(new Date());
        const end = addWeeks(start, 6);
        return { startAt: start, endAt: end };
    }, []);

    const { data, isLoading } = trpc.coach.getWeeklyRequirementsRange.useQuery({
        teamId,
        startAt,
        endAt,
    });

    useEffect(() => {
        if (data) {
            // Map the 6 weeks
            const initialWeeks: WeeklyTarget[] = [];
            for (let i = 0; i < 6; i++) {
                const weekStart = addWeeks(startAt, i);
                // Find existing req
                const existing = data.find(
                    (d) => new Date(d.weekStartAt).getTime() === weekStart.getTime(),
                );

                initialWeeks.push({
                    weekStartAt: weekStart,
                    requiredMinutes: existing?.requiredMinutes ?? 0,
                    originalMinutes: existing?.requiredMinutes ?? 0,
                });
            }
            setWeeks(initialWeeks);
        }
    }, [data, startAt]); // startAt is dependent on Today, which we treat as stable for this render

    const { mutateAsync: saveRequirements, isLoading: isSaving } =
        trpc.coach.setWeeklyRequirements.useMutation({
            onSuccess: () => {
                utils.coach.getWeeklyRequirementsRange.invalidate();
                utils.coach.getWeeklySettings.invalidate();
                utils.coach.getTeamOverview.invalidate();
            },
        });

    const handleMinuteChange = (index: number, value: string) => {
        const numValue = parseInt(value, 10);
        // Allow empty string to be 0 or handle it?
        // If NaN, maybe just don't update if it's invalid input?
        // Or set to 0. Let's handle generic input.
        const cleanValue = isNaN(numValue) ? 0 : numValue;

        setWeeks((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], requiredMinutes: cleanValue };
            return next;
        });
    };

    const handleSave = async () => {
        await saveRequirements({
            teamId,
            requirements: weeks.map((w) => ({
                weekStartAt: w.weekStartAt,
                requiredMinutes: w.requiredMinutes,
            })),
        });
    };

    const hasChanges = weeks.some(w => w.requiredMinutes !== w.originalMinutes);

    if (isLoading && weeks.length === 0) {
        return <div className="p-4 text-sm text-default-500">Loading schedule...</div>;
    }

    return (
        <Card className={`p-0 overflow-hidden ${className}`}>
            <div className="p-4 border-b border-divider">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold">Weekly Targets</h3>
                        <p className="text-sm text-default-500">Set minutes for the upcoming 6 weeks.</p>
                    </div>
                    <Button
                        size="sm"
                        disabled={!hasChanges || isSaving}
                        onClick={handleSave}
                    >
                        {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-default-50 text-default-500">
                        <tr>
                            <th className="px-4 py-3 font-medium">Week</th>
                            <th className="px-4 py-3 font-medium">Target Minutes</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-divider">
                        {weeks.map((week, index) => {
                            const isCurrentWeek = index === 0;
                            return (
                                <tr key={platformDate(week.weekStartAt)} className={isCurrentWeek ? "bg-primary-50/10" : ""}>
                                    <td className="px-4 py-3 align-middle">
                                        <div className="font-medium">
                                            {formatShortDate(week.weekStartAt)} - {formatShortDate(addWeeks(week.weekStartAt, 1))}
                                            {isCurrentWeek && <span className="ml-2 text-xs font-bold text-primary uppercase tracking-wider"> [Current]</span>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 align-middle">
                                        <Input
                                            type="number"
                                            min="0"
                                            className="max-w-[120px]"
                                            value={String(week.requiredMinutes)}
                                            onChange={(e) => handleMinuteChange(index, e.target.value)}
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
    return date.toISOString().split('T')[0];
}
