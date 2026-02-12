"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WeeklyTargetsTable } from "@/components/coach/weekly-targets-table";
import { Input } from "@/components/ui/input";
import { formatWeekRange } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";

type ExemptionMode = "NONE" | "WEEK" | "INDEFINITE";

type DraftState = {
  customMinutes: string;
  exemptionMode: ExemptionMode;
  reason: string;
};

const getExemptionMode = (target: {
  exemption: { isIndefinite: boolean } | null;
}): ExemptionMode => {
  if (!target.exemption) {
    return "NONE";
  }
  return target.exemption.isIndefinite ? "INDEFINITE" : "WEEK";
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

  const [draftByAthleteId, setDraftByAthleteId] = useState<Record<string, DraftState>>({});
  const [savingAthleteId, setSavingAthleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.athleteTargets) {
      return;
    }

    const next: Record<string, DraftState> = {};

    for (const target of data.athleteTargets) {
      next[target.athleteId] = {
        customMinutes:
          typeof target.override?.requiredMinutes === "number"
            ? String(target.override.requiredMinutes)
            : "",
        exemptionMode: getExemptionMode(target),
        reason: target.override?.reason ?? target.exemption?.reason ?? "",
      };
    }

    setDraftByAthleteId(next);
  }, [data]);

  const { mutateAsync: setExemption } = trpc.coach.setExemption.useMutation();
  const { mutateAsync: removeExemption } = trpc.coach.removeExemption.useMutation();
  const { mutateAsync: setOverride } =
    trpc.coach.setAthleteWeeklyRequirementOverride.useMutation();
  const { mutateAsync: removeOverride } =
    trpc.coach.removeAthleteWeeklyRequirementOverride.useMutation();

  const setDraft = (
    athleteId: string,
    updater: (current: DraftState) => DraftState,
  ) => {
    setDraftByAthleteId((prev) => {
      const current =
        prev[athleteId] ?? {
          customMinutes: "",
          exemptionMode: "NONE",
          reason: "",
        };
      return {
        ...prev,
        [athleteId]: updater(current),
      };
    });
  };

  const getInitialState = (target: {
    override: { requiredMinutes: number; reason: string | null } | null;
    exemption: { isIndefinite: boolean; reason: string | null } | null;
  }): DraftState => ({
    customMinutes:
      typeof target.override?.requiredMinutes === "number"
        ? String(target.override.requiredMinutes)
        : "",
    exemptionMode: getExemptionMode(target),
    reason: target.override?.reason ?? target.exemption?.reason ?? "",
  });

  const isRowDirty = (
    target: {
      athleteId: string;
      override: { requiredMinutes: number; reason: string | null } | null;
      exemption: { isIndefinite: boolean; reason: string | null } | null;
    },
    draft: DraftState,
  ) => {
    const initial = getInitialState(target);
    return (
      initial.customMinutes !== draft.customMinutes ||
      initial.exemptionMode !== draft.exemptionMode ||
      initial.reason.trim() !== draft.reason.trim()
    );
  };

  const getPreview = (
    target: { teamRequiredMinutes: number },
    draft: DraftState,
  ) => {
    if (draft.exemptionMode !== "NONE") {
      return "Exempt";
    }

    const parsed = Number.parseInt(draft.customMinutes, 10);
    if (!Number.isNaN(parsed) && draft.customMinutes.trim() !== "") {
      return `${parsed} min`;
    }

    return `${target.teamRequiredMinutes} min`;
  };

  const saveAthleteTarget = async (target: {
    athleteId: string;
    override: { id: string } | null;
    exemption: { id: string } | null;
  }) => {
    if (!data) {
      return;
    }

    const draft = draftByAthleteId[target.athleteId];
    if (!draft) {
      return;
    }

    const reason = draft.reason.trim();
    const reasonValue = reason.length > 0 ? reason : undefined;

    setSavingAthleteId(target.athleteId);

    try {
      if (draft.exemptionMode === "NONE") {
        if (target.exemption?.id) {
          await removeExemption({ exemptionId: target.exemption.id });
        }

        const parsedCustomMinutes = Number.parseInt(draft.customMinutes, 10);
        const hasCustomMinutes =
          draft.customMinutes.trim() !== "" && !Number.isNaN(parsedCustomMinutes);

        if (hasCustomMinutes) {
          if (!data.isCurrentWeek) {
            throw new Error("Custom minutes can only be set for the current week.");
          }
          await setOverride({
            athleteId: target.athleteId,
            weekStartAt: data.weekStartAt,
            requiredMinutes: parsedCustomMinutes,
            reason: reasonValue,
          });
        } else if (target.override?.id) {
          await removeOverride({ overrideId: target.override.id });
        }
      } else {
        if (target.override?.id) {
          await removeOverride({ overrideId: target.override.id });
        }

        await setExemption({
          athleteId: target.athleteId,
          weekStartAt: data.weekStartAt,
          reason: reasonValue,
          isIndefinite: draft.exemptionMode === "INDEFINITE",
        });
      }

      await Promise.all([
        utils.coach.getWeeklySettings.invalidate(),
        utils.coach.getTeamOverview.invalidate(),
      ]);
    } finally {
      setSavingAthleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly settings"
        subtitle={
          data
            ? `Week of ${formatWeekRange(data.weekStartAt, data.weekEndAt)}`
            : "Set weekly requirements and athlete exceptions."
        }
        actions={
          data ? (
            <div className="flex items-center gap-2 text-sm text-default-500">
              Week boundary: Sunday 8:00 PM ET
            </div>
          ) : null
        }
      />

      
        <div className="space-y-6">
          {data && <WeeklyTargetsTable teamId={data.teamId} />}
        </div>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="section-title">Athlete exceptions</p>
              <p className="text-sm text-default-500">
                Set exemptions for this week or indefinitely, and custom minutes for the current week.
              </p>
            </div>
            {data?.isCurrentWeek ? (
              <Badge tone="info">Current week</Badge>
            ) : (
              <Badge tone="pending">Past week</Badge>
            )}
          </div>

          {!data?.isCurrentWeek ? (
            <p className="text-xs text-default-500">
              Custom minutes can only be edited for the current week. Exemptions can still be updated.
            </p>
          ) : null}

          {isLoading ? (
            <p className="text-sm text-default-500">Loading weekly settings...</p>
          ) : error ? (
            <p className="text-sm text-rose-500">Unable to load settings.</p>
          ) : data ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-default-50 text-default-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Athlete</th>
                    <th className="px-3 py-2 font-medium">Team target</th>
                    <th className="px-3 py-2 font-medium">Custom minutes</th>
                    <th className="px-3 py-2 font-medium">Exemption</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium">Effective target</th>
                    <th className="px-3 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {data.athleteTargets.map((target) => {
                    const draft =
                      draftByAthleteId[target.athleteId] ?? getInitialState(target);
                    const isSaving = savingAthleteId === target.athleteId;
                    const dirty = isRowDirty(target, draft);
                    const preview = getPreview(target, draft);
                    const customDisabled =
                      draft.exemptionMode !== "NONE" || !data.isCurrentWeek;

                    return (
                      <tr key={target.athleteId}>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {target.athleteName}
                        </td>
                        <td className="px-3 py-2 text-default-700">
                          {target.teamRequiredMinutes} min
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            className="max-w-[120px]"
                            value={draft.customMinutes}
                            disabled={customDisabled}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraft(target.athleteId, (current) => ({
                                ...current,
                                customMinutes: value,
                                exemptionMode:
                                  value.trim() === "" ? current.exemptionMode : "NONE",
                              }));
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="input-field min-w-[150px]"
                            value={draft.exemptionMode}
                            onChange={(event) => {
                              const mode = event.target.value as ExemptionMode;
                              setDraft(target.athleteId, (current) => ({
                                ...current,
                                exemptionMode: mode,
                                customMinutes:
                                  mode === "NONE" ? current.customMinutes : "",
                              }));
                            }}
                          >
                            <option value="NONE">None</option>
                            <option value="WEEK">This week</option>
                            <option value="INDEFINITE">Indefinite</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={draft.reason}
                            className="min-w-[180px]"
                            onChange={(event) =>
                              setDraft(target.athleteId, (current) => ({
                                ...current,
                                reason: event.target.value,
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{preview}</td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!dirty || isSaving}
                            onClick={() => saveAthleteTarget(target)}
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
    </div>
  );
}
