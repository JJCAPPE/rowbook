"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WeeklyTargetsTable } from "@/components/coach/weekly-targets-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatWeekRange } from "@/lib/format";
import { trpc } from "@/lib/trpc";

type AthleteOption = {
  id: string;
  name: string;
};

type ExemptionItem = {
  id: string;
  athleteId: string;
  athleteName: string;
  reason: string | null;
  isIndefinite?: boolean;
};

export default function CoachSettingsPage() {
  const utils = trpc.useUtils();
  const searchParams = useSearchParams();
  const weekStartParam = searchParams.get("weekStartAt");
  const weekStartAt = useMemo(() => {
    if (!weekStartParam) {
      return undefined;
    }
    const parsed = new Date(weekStartParam);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, [weekStartParam]);

  const { data, isLoading, error } = trpc.coach.getWeeklySettings.useQuery(
    weekStartAt ? { weekStartAt } : undefined,
  );
  const athletes: AthleteOption[] = data?.athletes ?? [];
  const exemptions: ExemptionItem[] = data?.exemptions ?? [];
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [exemptionReason, setExemptionReason] = useState("");
  const [isIndefinite, setIsIndefinite] = useState(false);

  const { mutateAsync: saveExemption, isLoading: isSavingExemption } =
    trpc.coach.setExemption.useMutation({
      onSuccess: async () => {
        setSelectedAthlete("");
        setExemptionReason("");
        setIsIndefinite(false);
        await utils.coach.getWeeklySettings.invalidate();
        await utils.coach.getTeamOverview.invalidate();
      },
    });

  const { mutateAsync: removeExemption, isLoading: isRemovingExemption } =
    trpc.coach.removeExemption.useMutation({
      onSuccess: async () => {
        await utils.coach.getWeeklySettings.invalidate();
        await utils.coach.getTeamOverview.invalidate();
      },
    });

  const { mutateAsync: saveRequirement, isLoading: isSavingRequirement } =
    trpc.coach.setWeeklyRequirement.useMutation({
      onSuccess: async () => {
        await utils.coach.getWeeklySettings.invalidate();
        await utils.coach.getTeamOverview.invalidate();
      },
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly settings"
        subtitle={
          data
            ? `Week of ${formatWeekRange(data.weekStartAt, data.weekEndAt)}`
            : "Set weekly requirements and exemptions."
        }
        actions={
          data ? (
            <div className="flex items-center gap-2 text-sm text-default-500">
              Week boundary: Sunday 8:00 PM ET
            </div>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {data && <WeeklyTargetsTable teamId={data.teamId} />}
        </div>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-title">Exemptions</p>
              <p className="text-sm text-default-500">Athletes excluded from weekly totals.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              type="button"
              disabled={!selectedAthlete || !data || isSavingExemption}
              onClick={() =>
                data
                  ? saveExemption({
                    athleteId: selectedAthlete,
                    weekStartAt: data.weekStartAt,
                    reason: exemptionReason || undefined,
                    isIndefinite,
                  })
                  : null
              }
            >
              {isSavingExemption ? "Saving..." : "Add exemption"}
            </Button>
          </div>
          {isLoading ? (
            <p className="text-sm text-default-500">Loading weekly settings...</p>
          ) : error ? (
            <p className="text-sm text-rose-500">Unable to load settings.</p>
          ) : data ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="exemptionAthlete">Athlete</Label>
                  <select
                    id="exemptionAthlete"
                    value={selectedAthlete}
                    onChange={(event) => setSelectedAthlete(event.target.value)}
                    className="input-field"
                  >
                    <option value="">Select athlete</option>
                    {athletes.map((athlete) => (
                      <option key={athlete.id} value={athlete.id}>
                        {athlete.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exemptionReason">Reason (optional)</Label>
                  <Input
                    id="exemptionReason"
                    value={exemptionReason}
                    onChange={(event) => setExemptionReason(event.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 pt-2 md:col-span-2">
                  <input
                    type="checkbox"
                    id="isIndefinite"
                    checked={isIndefinite}
                    onChange={(e) => setIsIndefinite(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="isIndefinite" className="cursor-pointer text-sm font-medium">
                    Exempt indefinitely
                  </Label>
                </div>
              </div>
              <div className="grid gap-3">
                {exemptions.length ? (
                  exemptions.map((exemption) => (
                    <div
                      key={exemption.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-divider/40 bg-content2/70 px-4 py-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{exemption.athleteName}</p>
                          {exemption.isIndefinite && (
                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                              Indefinite
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-default-500">{exemption.reason ?? "No reason"}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        disabled={isRemovingExemption}
                        onClick={() =>
                          removeExemption({
                            athleteId: exemption.athleteId,
                            weekStartAt: data.weekStartAt,
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-default-500">No exemptions yet.</p>
                )}
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
