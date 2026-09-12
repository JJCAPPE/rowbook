"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WeeklyTargetsTable } from "@/components/coach/weekly-targets-table";
import { Input } from "@/components/ui/input";
import { FilterChip } from "@/components/ui/filter-chip";
import { formatWeekRange } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";

type ExemptionMode = "NONE" | "WEEK" | "INDEFINITE";

type DraftState = {
  customMinutes: string;
  exemptionMode: ExemptionMode;
  reason: string;
};

const getRowToneClass = (draft: DraftState) => {
  if (draft.exemptionMode === "INDEFINITE") {
    return "bg-rose-500/5";
  }

  if (draft.exemptionMode === "WEEK") {
    return "bg-amber-500/5";
  }

  if (draft.customMinutes.trim() !== "") {
    return "bg-green-500/5";
  }

  return "";
};

const getExemptionMode = (target: {
  exemption: { isIndefinite: boolean } | null;
}): ExemptionMode => {
  if (!target.exemption) {
    return "NONE";
  }
  return target.exemption.isIndefinite ? "INDEFINITE" : "WEEK";
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

export default function CoachSettingsPage() {
  const utils = trpc.useUtils();
  const searchParams = useSearchParams();
  const teamId = searchParams.get("teamId") ?? undefined;
  const weekStartParam = searchParams.get("weekStartAt");
  const weekStartAt = useMemo(() => {
    if (!weekStartParam) {
      return undefined;
    }
    const parsed = new Date(weekStartParam);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }, [weekStartParam]);

  const settingsInput = useMemo(
    () =>
      teamId || weekStartAt
        ? {
            ...(teamId ? { teamId } : {}),
            ...(weekStartAt ? { weekStartAt } : {}),
          }
        : undefined,
    [teamId, weekStartAt],
  );
  const { data, isLoading, error } =
    trpc.coach.getWeeklySettings.useQuery(settingsInput);

  const [draftByAthleteId, setDraftByAthleteId] = useState<
    Record<string, DraftState>
  >({});
  const [savingAthleteId, setSavingAthleteId] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [nameQuery, setNameQuery] = useState("");
  const [filterExempt, setFilterExempt] = useState(false);
  const [filterWeeklyExempt, setFilterWeeklyExempt] = useState(false);
  const [filterCustomMinutes, setFilterCustomMinutes] = useState(false);
  const [hasTeamTargetChanges, setHasTeamTargetChanges] = useState(false);
  const draftContextRef = useRef<string | null>(null);

  useEffect(() => {
    if (!data?.athleteTargets) {
      return;
    }

    const contextKey = `${data.teamId}:${data.weekStartAt.toISOString()}`;
    const preserveDirtyRows = draftContextRef.current === contextKey;
    setDraftByAthleteId((current) => {
      const next: Record<string, DraftState> = {};
      for (const target of data.athleteTargets) {
        const initial = getInitialState(target);
        const currentDraft = current[target.athleteId];
        next[target.athleteId] =
          preserveDirtyRows && currentDraft && isRowDirty(target, currentDraft)
            ? currentDraft
            : initial;
      }
      return next;
    });
    draftContextRef.current = contextKey;
  }, [data]);

  const { mutateAsync: saveWeeklySetting } =
    trpc.coach.saveAthleteWeeklySetting.useMutation();

  const setDraft = (
    athleteId: string,
    updater: (current: DraftState) => DraftState,
  ) => {
    setDraftByAthleteId((prev) => {
      const current = prev[athleteId] ?? {
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
    const reasonValue = reason.length > 0 ? reason : null;
    const customValue = draft.customMinutes.trim();
    const requiredMinutes = customValue === "" ? null : Number(customValue);
    if (
      draft.exemptionMode === "NONE" &&
      requiredMinutes !== null &&
      (!Number.isInteger(requiredMinutes) ||
        requiredMinutes < 0 ||
        requiredMinutes > 10_080)
    ) {
      setSaveErrors((current) => ({
        ...current,
        [target.athleteId]: "Enter whole minutes from 0 to 10,080.",
      }));
      return;
    }

    setSavingAthleteId(target.athleteId);
    setSaveErrors((current) => ({ ...current, [target.athleteId]: "" }));

    try {
      await saveWeeklySetting({
        teamId: data.teamId,
        athleteId: target.athleteId,
        weekStartAt: data.weekStartAt,
        mode: draft.exemptionMode,
        requiredMinutes:
          draft.exemptionMode === "NONE" ? requiredMinutes : null,
        reason: reasonValue,
      });

      await Promise.all([
        utils.coach.getWeeklySettings.invalidate(),
        utils.coach.getTeamOverview.invalidate(),
      ]);
    } catch (error) {
      setSaveErrors((current) => ({
        ...current,
        [target.athleteId]:
          error instanceof Error
            ? error.message
            : "This setting was not saved. Try again.",
      }));
    } finally {
      setSavingAthleteId(null);
    }
  };

  const athleteTargets = data?.athleteTargets ?? [];
  const dirtyAthleteIds = new Set(
    athleteTargets.flatMap((target) => {
      const draft = draftByAthleteId[target.athleteId];
      return draft && isRowDirty(target, draft) ? [target.athleteId] : [];
    }),
  );
  const hasUnsavedChanges =
    dirtyAthleteIds.size > 0 || hasTeamTargetChanges;

  useEffect(() => {
    if (hasUnsavedChanges) {
      document.body.dataset.rowbookUnsavedSettings = "true";
    } else {
      delete document.body.dataset.rowbookUnsavedSettings;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
    };
    const handleLinkClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank") return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.href !== window.location.href &&
        !window.confirm("Discard your unsaved weekly setting changes?")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    return () => {
      delete document.body.dataset.rowbookUnsavedSettings;
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleLinkClick, true);
    };
  }, [hasUnsavedChanges]);

  const filteredAthleteTargets = (() => {
    const targets = data?.athleteTargets ?? [];
    const query = nameQuery.trim().toLowerCase();
    const hasTypeFilter =
      filterExempt || filterWeeklyExempt || filterCustomMinutes;

    return targets.filter((target) => {
      const draft =
        draftByAthleteId[target.athleteId] ?? getInitialState(target);
      if (isRowDirty(target, draft)) return true;
      const isExempt = draft.exemptionMode !== "NONE";
      const isWeeklyExempt = draft.exemptionMode === "WEEK";
      const hasCustom =
        draft.exemptionMode === "NONE" && draft.customMinutes.trim() !== "";

      const typeMatch =
        !hasTypeFilter ||
        (filterExempt && isExempt) ||
        (filterWeeklyExempt && isWeeklyExempt) ||
        (filterCustomMinutes && hasCustom);

      const nameMatch =
        !query || target.athleteName.toLowerCase().includes(query);
      return typeMatch && nameMatch;
    });
  })();

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
        {data && (
          <WeeklyTargetsTable
            teamId={data.teamId}
            onDirtyChange={setHasTeamTargetChanges}
          />
        )}
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-title">Athlete exceptions</p>
            <p className="text-sm text-default-500">
              Set exemptions for this week or indefinitely, and custom minutes
              for the current week.
            </p>
          </div>
          {data?.isCurrentWeek ? (
            <Badge tone="info">Current week</Badge>
          ) : (
            <Badge tone="pending">Past week</Badge>
          )}
          {hasUnsavedChanges ? (
            <Badge tone="pending">
              {dirtyAthleteIds.size > 0
                ? `${dirtyAthleteIds.size} athlete ${dirtyAthleteIds.size === 1 ? "change" : "changes"} unsaved`
                : "Weekly targets unsaved"}
            </Badge>
          ) : null}
        </div>

        {!data?.isCurrentWeek ? (
          <p className="text-xs text-default-500">
            Custom minutes can only be edited for the current week. Exemptions
            can still be updated.
          </p>
        ) : null}

        {data ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder="Search by athlete name"
              className="min-w-[220px] max-w-[320px]"
            />
            <FilterChip
              isActive={filterExempt}
              onClick={() => setFilterExempt((prev) => !prev)}
            >
              Exempt
            </FilterChip>
            <FilterChip
              isActive={filterWeeklyExempt}
              onClick={() => setFilterWeeklyExempt((prev) => !prev)}
            >
              Weekly exempt
            </FilterChip>
            <FilterChip
              isActive={filterCustomMinutes}
              onClick={() => setFilterCustomMinutes((prev) => !prev)}
            >
              Custom minutes
            </FilterChip>
          </div>
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
                {filteredAthleteTargets.map((target) => {
                  const draft =
                    draftByAthleteId[target.athleteId] ??
                    getInitialState(target);
                  const isSaving = savingAthleteId === target.athleteId;
                  const dirty = isRowDirty(target, draft);
                  const preview = getPreview(target, draft);
                  const rowToneClass = getRowToneClass(draft);
                  const customDisabled =
                    draft.exemptionMode !== "NONE" || !data.isCurrentWeek;

                  return (
                    <tr key={target.athleteId} className={rowToneClass}>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {target.athleteName}
                        {dirty ? (
                          <span className="ml-2 text-xs font-medium text-amber-700">
                            Unsaved
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-default-700">
                        {target.teamRequiredMinutes} min
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          aria-label={`Custom minutes for ${target.athleteName}`}
                          className="max-w-[120px] input-no-spinner"
                          value={draft.customMinutes}
                          disabled={customDisabled}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDraft(target.athleteId, (current) => ({
                              ...current,
                              customMinutes: value,
                              exemptionMode:
                                value.trim() === ""
                                  ? current.exemptionMode
                                  : "NONE",
                            }));
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          aria-label={`Exemption for ${target.athleteName}`}
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
                          aria-label={`Reason for ${target.athleteName}`}
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
                      <td className="px-3 py-2 font-medium text-foreground">
                        {preview}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!dirty || isSaving}
                          onClick={() => saveAthleteTarget(target)}
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </Button>
                        {saveErrors[target.athleteId] ? (
                          <p
                            role="alert"
                            className="mt-2 max-w-48 text-xs leading-relaxed text-rose-600"
                          >
                            {saveErrors[target.athleteId]}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
                {filteredAthleteTargets.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-sm text-default-500"
                      colSpan={7}
                    >
                      No athletes match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
