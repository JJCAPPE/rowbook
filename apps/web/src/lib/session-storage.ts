const ROWBOOK_SESSION_STORAGE_PREFIX = "rowbook:";

export const getWorkoutDraftStorageKey = (athleteId: string) =>
  `${ROWBOOK_SESSION_STORAGE_PREFIX}workout-draft:v2:${athleteId}`;

export const getWeeklyTargetsDraftStorageKey = (
  teamId: string,
  weekStartAt: Date,
) =>
  `${ROWBOOK_SESSION_STORAGE_PREFIX}weekly-targets:v1:${teamId}:${weekStartAt.toISOString()}`;

export const clearLegacyWorkoutDraft = () => {
  window.sessionStorage.removeItem(
    `${ROWBOOK_SESSION_STORAGE_PREFIX}workout-draft:v1`,
  );
};

export const clearRowbookSessionStorage = () => {
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(ROWBOOK_SESSION_STORAGE_PREFIX)) {
      window.sessionStorage.removeItem(key);
    }
  }
};
