"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
};

export default function CoachSettingsPage() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.coach.getWeeklySettings.useQuery();
  const athletes: AthleteOption[] = data?.athletes ?? [];
  const exemptions: ExemptionItem[] = data?.exemptions ?? [];
  const [requiredMinutes, setRequiredMinutes] = useState(0);
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [exemptionReason, setExemptionReason] = useState("");

  useEffect(() => {
    if (data?.requiredMinutes !== undefined) {
      setRequiredMinutes(data.requiredMinutes);
    }
  }, [data?.requiredMinutes]);

  const { mutateAsync: saveRequirement, isLoading: isSavingRequirement } =
    trpc.coach.setWeeklyRequirement.useMutation({
      onSuccess: async () => {
        await utils.coach.getWeeklySettings.invalidate();
        await utils.coach.getTeamOverview.invalidate();
      },
    });

  const { mutateAsync: saveExemption, isLoading: isSavingExemption } =
    trpc.coach.setExemption.useMutation({
      onSuccess: async () => {
        setSelectedAthlete("");
        setExemptionReason("");
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly settings"
        subtitle={
          data
            ? `Week of ${formatWeekRange(data.weekStartAt, data.weekEndAt)}`
            : "Set weekly requirements and exemptions."
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="space-y-4">
          <div>
            <p className="section-title">Required minutes</p>
            <p className="text-sm text-default-500">Applies to all active athletes.</p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="requiredMinutes">Minutes</Label>
              <Input
                id="requiredMinutes"
                type="number"
                value={String(requiredMinutes)}
                min={0}
                onChange={(event) => setRequiredMinutes(Number(event.target.value))}
              />
            </div>
            <Button
              type="button"
              disabled={isSavingRequirement || !data}
              onClick={() =>
                data
                  ? saveRequirement({
                      teamId: data.teamId,
                      weekStartAt: data.weekStartAt,
                      requiredMinutes,
                    })
                  : null
              }
            >
              {isSavingRequirement ? "Saving..." : "Save requirement"}
            </Button>
          </div>
        </Card>

        <Card className="space-y-4">
          <div>
            <p className="section-title">Week boundary</p>
            <p className="text-sm text-default-500">Sunday at 6:00 PM ET.</p>
          </div>
          <div className="rounded-2xl border border-divider/40 bg-content2/70 p-4 text-sm text-default-500">
            Entries after 6:00 PM roll into the next week and proof images are kept for
            7 days after the cutoff.
          </div>
        </Card>
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
            </div>
            <div className="grid gap-3">
              {exemptions.length ? (
                exemptions.map((exemption) => (
                  <div
                    key={exemption.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-divider/40 bg-content2/70 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{exemption.athleteName}</p>
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
  );
}
