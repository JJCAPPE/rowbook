"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ACTIVITY_TYPE_LABELS,
  ActivityTypeValues,
  formatInTimeZone,
} from "@rowbook/shared";

import { ProofUploadItem } from "@/components/forms/proof-upload-item";
import {
  MAX_PROOF_FILES,
  normalizeProofImage,
  ProofImageProcessingError,
  ProofUploadTransferError,
  startProofUpload,
  type ProofUploadStatus,
} from "@/components/forms/proof-upload-client";
import { ActivityIcon } from "@/components/ui/activity-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/ui/pill";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  clearLegacyWorkoutDraft,
  getWorkoutDraftStorageKey,
} from "@/lib/session-storage";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const optionalNumber = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined ? undefined : value,
  z.coerce.number().positive().optional(),
);

const getTodayString = () => formatInTimeZone(new Date());

const schema = z
  .object({
    activityType: z.enum(ActivityTypeValues),
    date: z
      .string()
      .min(1, "Select a date")
      .refine(
        (value) => !Number.isNaN(new Date(value).getTime()),
        "Select a valid date",
      )
      .refine(
        (value) => value <= getTodayString(),
        "Date cannot be in the future",
      ),
    minutes: z.coerce.number().min(1, "Enter minutes"),
    distanceKm: z.coerce
      .number()
      .nonnegative()
      .max(
        500,
        "Distance looks too large. Enter kilometers (km), not meters (m).",
      ),
    avgHr: optionalNumber,
    notes: z.string().max(280).optional(),
    proofImageIds: z
      .array(z.string())
      .min(1, "At least one proof image is required")
      .max(MAX_PROOF_FILES),
  })
  .superRefine((values, context) => {
    if (values.activityType !== "OTHER" && values.distanceKm < 0.001) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["distanceKm"],
        message: "Enter distance",
      });
    }
  });

type FormValues = z.infer<typeof schema>;
type DraftValues = Pick<
  FormValues,
  "activityType" | "date" | "minutes" | "distanceKm" | "avgHr" | "notes"
>;

type SubmissionIntent = {
  values: DraftValues;
  proofImageIds: string[];
};

type StoredReadyProof = {
  name: string;
  proofImageId: string;
};

type PersistedDraft = {
  version: 2;
  athleteId: string;
  clientSubmissionId: string;
  values: DraftValues;
  readyProofs: StoredReadyProof[];
  unfinishedFileCount: number;
  pendingIntent: SubmissionIntent | null;
};

type ProofItem = {
  id: string;
  name: string;
  sourceFile: File | null;
  normalizedFile: File | null;
  previewUrl: string | null;
  status: ProofUploadStatus;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  error: string | null;
  retryable: boolean;
  proofImageId: string | null;
};

type SaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "checking"
  | "needs-review"
  | "rejected";

const defaultValues: FormValues = {
  activityType: "ERG",
  date: getTodayString(),
  minutes: 0,
  distanceKm: 0,
  avgHr: undefined,
  notes: "",
  proofImageIds: [],
};

const parseNumberValue = (value: unknown) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toDraftValues = (values: Partial<FormValues>): DraftValues => ({
  activityType: ActivityTypeValues.includes(
    values.activityType as (typeof ActivityTypeValues)[number],
  )
    ? (values.activityType as DraftValues["activityType"])
    : "ERG",
  date:
    typeof values.date === "string" && values.date
      ? values.date
      : getTodayString(),
  minutes: parseNumberValue(values.minutes) ?? 0,
  distanceKm: parseNumberValue(values.distanceKm) ?? 0,
  avgHr: parseNumberValue(values.avgHr) ?? undefined,
  notes: typeof values.notes === "string" ? values.notes.slice(0, 280) : "",
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseDraftValues = (value: unknown): DraftValues | null => {
  if (!isRecord(value)) return null;
  if (
    !ActivityTypeValues.includes(
      value.activityType as (typeof ActivityTypeValues)[number],
    ) ||
    typeof value.date !== "string"
  ) {
    return null;
  }

  const minutes = parseNumberValue(value.minutes);
  const distanceKm = parseNumberValue(value.distanceKm);
  const avgHr = parseNumberValue(value.avgHr);
  if (minutes === null || distanceKm === null) return null;

  return {
    activityType: value.activityType as DraftValues["activityType"],
    date: value.date,
    minutes,
    distanceKm,
    avgHr: avgHr ?? undefined,
    notes: typeof value.notes === "string" ? value.notes.slice(0, 280) : "",
  };
};

const parseSubmissionIntent = (value: unknown): SubmissionIntent | null => {
  if (!isRecord(value)) return null;
  const values = parseDraftValues(value.values);
  const proofImageIds = Array.isArray(value.proofImageIds)
    ? value.proofImageIds.filter(
        (proofImageId): proofImageId is string =>
          typeof proofImageId === "string" && proofImageId.length > 0,
      )
    : [];
  if (
    !values ||
    proofImageIds.length === 0 ||
    proofImageIds.length > MAX_PROOF_FILES
  ) {
    return null;
  }
  return { values, proofImageIds };
};

const readPersistedDraft = (athleteId: string): PersistedDraft | null => {
  try {
    clearLegacyWorkoutDraft();
    const raw = window.sessionStorage.getItem(
      getWorkoutDraftStorageKey(athleteId),
    );
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 2 ||
      parsed.athleteId !== athleteId ||
      typeof parsed.clientSubmissionId !== "string" ||
      !UUID_PATTERN.test(parsed.clientSubmissionId)
    ) {
      return null;
    }

    const values = parseDraftValues(parsed.values);
    if (!values) return null;
    const readyProofs = Array.isArray(parsed.readyProofs)
      ? parsed.readyProofs
          .filter(
            (proof): proof is StoredReadyProof =>
              isRecord(proof) &&
              typeof proof.name === "string" &&
              typeof proof.proofImageId === "string" &&
              proof.proofImageId.length > 0,
          )
          .slice(0, MAX_PROOF_FILES)
      : [];
    const readyIds = new Set(readyProofs.map((proof) => proof.proofImageId));
    const pendingIntent = parseSubmissionIntent(parsed.pendingIntent);

    return {
      version: 2,
      athleteId,
      clientSubmissionId: parsed.clientSubmissionId,
      values,
      readyProofs,
      unfinishedFileCount:
        typeof parsed.unfinishedFileCount === "number"
          ? Math.max(0, Math.floor(parsed.unfinishedFileCount))
          : 0,
      pendingIntent:
        pendingIntent &&
        pendingIntent.proofImageIds.every((proofImageId) =>
          readyIds.has(proofImageId),
        )
          ? pendingIntent
          : null,
    };
  } catch {
    return null;
  }
};

const persistDraft = (draft: PersistedDraft) => {
  try {
    window.sessionStorage.setItem(
      getWorkoutDraftStorageKey(draft.athleteId),
      JSON.stringify(draft),
    );
  } catch {
    // A full or unavailable storage area must not block workout logging.
  }
};

const clearPersistedDraft = (athleteId: string) => {
  try {
    window.sessionStorage.removeItem(getWorkoutDraftStorageKey(athleteId));
  } catch {
    // The acknowledged save still stands if browser storage is unavailable.
  }
};

const sameSubmissionIntent = (
  left: SubmissionIntent,
  right: SubmissionIntent,
) => JSON.stringify(left) === JSON.stringify(right);

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

export const LogWorkoutForm = () => {
  const { data: session } = trpc.auth.getSession.useQuery(undefined, {
    retry: false,
  });
  const athleteId = session?.user.id;
  const [proofItems, setProofItems] = useState<ProofItem[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [checkingEntryId, setCheckingEntryId] = useState<string | null>(null);
  const [hasPendingIntent, setHasPendingIntent] = useState(false);
  const [proofInputKey, setProofInputKey] = useState(0);
  const itemsRef = useRef<ProofItem[]>([]);
  const mountedRef = useRef(true);
  const activeTaskCountRef = useRef(0);
  const queuedIdsRef = useRef<string[]>([]);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const uploadCancelsRef = useRef(new Map<string, () => void>());
  const pumpQueueRef = useRef<() => void>(() => undefined);
  const clientSubmissionIdRef = useRef<string | null>(null);
  const pendingIntentRef = useRef<SubmissionIntent | null>(null);
  const submitLockRef = useRef(false);
  const draftReadyRef = useRef(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const today = getTodayString();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    getValues,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const utils = trpc.useUtils();
  const { mutateAsync: createUploadUrl } =
    trpc.proof.createUploadUrl.useMutation();
  const { mutateAsync: confirmUpload } = trpc.proof.confirmUpload.useMutation();
  const { mutateAsync: createEntry } = trpc.athlete.createEntry.useMutation();
  const entryStatus = trpc.athlete.getEntryValidationStatus.useQuery(
    { entryId: checkingEntryId ?? "" },
    {
      enabled: Boolean(checkingEntryId),
      retry: 3,
      refetchInterval: 2_000,
    },
  );
  const activityType = watch("activityType");
  const proofDraftSignature = useMemo(
    () =>
      JSON.stringify(
        proofItems.map(({ id, name, status, proofImageId }) => ({
          id,
          name,
          status,
          proofImageId,
        })),
      ),
    [proofItems],
  );

  const updateItems = useCallback(
    (updater: (current: ProofItem[]) => ProofItem[]) => {
      const next = updater(itemsRef.current);
      itemsRef.current = next;
      if (mountedRef.current) setProofItems(next);
      return next;
    },
    [],
  );

  const updateItem = useCallback(
    (id: string, updater: (item: ProofItem) => ProofItem) => {
      updateItems((current) =>
        current.map((item) => (item.id === id ? updater(item) : item)),
      );
    },
    [updateItems],
  );

  const ensureClientSubmissionId = useCallback(() => {
    if (!clientSubmissionIdRef.current) {
      clientSubmissionIdRef.current = crypto.randomUUID();
    }
    return clientSubmissionIdRef.current;
  }, []);

  const persistCurrentDraft = useCallback(() => {
    if (!draftReadyRef.current || !athleteId) return;
    const currentItems = itemsRef.current;
    const values = toDraftValues(getValues());
    const isEmptyDefaultDraft =
      currentItems.length === 0 &&
      !pendingIntentRef.current &&
      values.activityType === defaultValues.activityType &&
      values.date === getTodayString() &&
      values.minutes === 0 &&
      values.distanceKm === 0 &&
      values.avgHr === undefined &&
      !values.notes;
    if (isEmptyDefaultDraft) {
      clearPersistedDraft(athleteId);
      return;
    }

    persistDraft({
      version: 2,
      athleteId,
      clientSubmissionId: ensureClientSubmissionId(),
      values,
      readyProofs: currentItems.flatMap((item) =>
        item.status === "ready" && item.proofImageId
          ? [{ name: item.name, proofImageId: item.proofImageId }]
          : [],
      ),
      unfinishedFileCount: currentItems.filter(
        (item) => item.status !== "ready",
      ).length,
      pendingIntent: pendingIntentRef.current,
    });
  }, [athleteId, ensureClientSubmissionId, getValues]);

  useEffect(() => {
    if (!athleteId) return;

    const stored = readPersistedDraft(athleteId);
    if (stored) {
      clientSubmissionIdRef.current = stored.clientSubmissionId;
      pendingIntentRef.current = stored.pendingIntent;
      setHasPendingIntent(Boolean(stored.pendingIntent));
      reset({
        ...defaultValues,
        ...stored.values,
        proofImageIds: stored.readyProofs.map((proof) => proof.proofImageId),
      });

      const restoredItems: ProofItem[] = stored.readyProofs.map((proof) => ({
        id: crypto.randomUUID(),
        name: proof.name || "Previously uploaded proof",
        sourceFile: null,
        normalizedFile: null,
        previewUrl: null,
        status: "ready",
        progress: 100,
        loadedBytes: 0,
        totalBytes: 0,
        error: null,
        retryable: false,
        proofImageId: proof.proofImageId,
      }));
      itemsRef.current = restoredItems;
      setProofItems(restoredItems);

      if (
        stored.pendingIntent ||
        stored.readyProofs.length > 0 ||
        stored.unfinishedFileCount > 0
      ) {
        setDraftNotice(
          stored.pendingIntent
            ? "An earlier save was interrupted. Retry it to confirm the workout without creating a duplicate."
            : stored.unfinishedFileCount > 0
              ? "Draft restored. Finished uploads are ready; reselect any photo that had not finished."
              : "Draft restored with your previously uploaded proof.",
        );
      }
    } else {
      ensureClientSubmissionId();
    }

    draftReadyRef.current = true;
  }, [athleteId, ensureClientSubmissionId, reset]);

  useEffect(() => {
    const subscription = watch(() => {
      persistCurrentDraft();
    });
    return () => subscription.unsubscribe();
  }, [persistCurrentDraft, watch]);

  useEffect(() => {
    persistCurrentDraft();
  }, [persistCurrentDraft, proofDraftSignature]);

  useEffect(() => {
    mountedRef.current = true;
    const abortControllers = abortControllersRef.current;
    const uploadCancels = uploadCancelsRef.current;
    return () => {
      mountedRef.current = false;
      queuedIdsRef.current = [];
      abortControllers.forEach((controller) => controller.abort());
      uploadCancels.forEach((cancel) => cancel());
      abortControllers.clear();
      uploadCancels.clear();
      itemsRef.current.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, []);

  const processProofItem = useCallback(
    async (id: string) => {
      const initial = itemsRef.current.find((item) => item.id === id);
      if (!initial || initial.status !== "queued") return;

      const controller = new AbortController();
      abortControllersRef.current.set(id, controller);
      let stage: "preparing" | "authorizing" | "uploading" | "confirming" =
        "preparing";

      try {
        updateItem(id, (item) => ({
          ...item,
          status: "preparing",
          error: null,
          retryable: false,
        }));

        let normalizedFile = initial.normalizedFile;
        if (!normalizedFile) {
          if (!initial.sourceFile) {
            throw new ProofImageProcessingError(
              "This photo is no longer available. Select it again.",
            );
          }
          let normalized;
          try {
            normalized = await normalizeProofImage(
              initial.sourceFile,
              controller.signal,
            );
          } catch (error) {
            if (
              isAbortError(error) ||
              error instanceof ProofImageProcessingError
            ) {
              throw error;
            }
            throw new ProofImageProcessingError(
              "This photo could not be prepared. Choose the original image or take it again.",
            );
          }
          normalizedFile = normalized.file;
          if (
            controller.signal.aborted ||
            !itemsRef.current.some((item) => item.id === id)
          ) {
            return;
          }

          const normalizedPreviewUrl = URL.createObjectURL(normalizedFile);
          let previousPreviewUrl: string | null = null;
          updateItem(id, (item) => {
            previousPreviewUrl = item.previewUrl;
            return {
              ...item,
              sourceFile: null,
              normalizedFile,
              previewUrl: normalizedPreviewUrl,
              totalBytes: normalizedFile?.size ?? 0,
            };
          });
          if (
            previousPreviewUrl &&
            previousPreviewUrl !== normalizedPreviewUrl
          ) {
            URL.revokeObjectURL(previousPreviewUrl);
          }
        }

        stage = "authorizing";
        updateItem(id, (item) => ({
          ...item,
          status: "preparing",
          progress: 0,
          loadedBytes: 0,
          totalBytes: normalizedFile?.size ?? 0,
        }));

        const upload = await createUploadUrl({
          clientSubmissionId: ensureClientSubmissionId(),
          fileName: normalizedFile.name,
          fileSize: normalizedFile.size,
          mimeType: "image/jpeg",
        });
        if (
          controller.signal.aborted ||
          !itemsRef.current.some((item) => item.id === id)
        ) {
          return;
        }

        stage = "uploading";
        updateItem(id, (item) => ({
          ...item,
          status: "uploading",
        }));
        const uploadControl = startProofUpload(
          upload.uploadUrl,
          normalizedFile,
          ({ loaded, total, percent }) => {
            if (controller.signal.aborted) return;
            updateItem(id, (item) => ({
              ...item,
              progress: percent,
              loadedBytes: loaded,
              totalBytes: total,
            }));
          },
        );
        uploadCancelsRef.current.set(id, uploadControl.cancel);
        await uploadControl.promise;
        uploadCancelsRef.current.delete(id);
        if (
          controller.signal.aborted ||
          !itemsRef.current.some((item) => item.id === id)
        ) {
          return;
        }

        stage = "confirming";
        updateItem(id, (item) => ({
          ...item,
          status: "confirming",
          progress: 100,
          loadedBytes: normalizedFile?.size ?? item.loadedBytes,
          totalBytes: normalizedFile?.size ?? item.totalBytes,
        }));
        await confirmUpload({ proofImageId: upload.proofImageId });
        if (
          controller.signal.aborted ||
          !itemsRef.current.some((item) => item.id === id)
        ) {
          return;
        }

        updateItem(id, (item) => ({
          ...item,
          status: "ready",
          progress: 100,
          error: null,
          retryable: false,
          proofImageId: upload.proofImageId,
        }));
      } catch (error) {
        if (
          controller.signal.aborted ||
          isAbortError(error) ||
          !itemsRef.current.some((item) => item.id === id)
        ) {
          return;
        }

        const processingError = error instanceof ProofImageProcessingError;
        const transferError = error instanceof ProofUploadTransferError;
        const message =
          processingError || transferError
            ? error.message
            : stage === "authorizing"
              ? "Could not prepare this upload. Check your connection and retry it."
              : stage === "confirming"
                ? "The photo uploaded but could not be confirmed. Retry this photo."
                : "The photo could not be uploaded. Check your connection and retry it.";

        updateItem(id, (item) => ({
          ...item,
          status: "error",
          error: message,
          retryable: !processingError,
          proofImageId: null,
        }));
      } finally {
        abortControllersRef.current.delete(id);
        uploadCancelsRef.current.delete(id);
      }
    },
    [confirmUpload, createUploadUrl, ensureClientSubmissionId, updateItem],
  );

  const pumpQueue = useCallback(() => {
    if (!mountedRef.current) return;

    while (activeTaskCountRef.current < 2 && queuedIdsRef.current.length > 0) {
      const id = queuedIdsRef.current.shift();
      if (!id) break;
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item || item.status !== "queued") continue;

      activeTaskCountRef.current += 1;
      void processProofItem(id).finally(() => {
        activeTaskCountRef.current = Math.max(
          0,
          activeTaskCountRef.current - 1,
        );
        pumpQueueRef.current();
      });
    }
  }, [processProofItem]);

  useEffect(() => {
    pumpQueueRef.current = pumpQueue;
    pumpQueue();
  }, [pumpQueue]);

  const handleFileSelect = useCallback(
    (selectedFiles: File[]) => {
      if (selectedFiles.length === 0) return;
      if (pendingIntentRef.current) {
        setSelectionError(
          "Retry the interrupted save before changing its proof photos.",
        );
        return;
      }

      const remainingSlots = MAX_PROOF_FILES - itemsRef.current.length;
      if (remainingSlots <= 0) {
        setSelectionError(`You can attach up to ${MAX_PROOF_FILES} photos.`);
        return;
      }

      const acceptedFiles = selectedFiles.slice(0, remainingSlots);
      const newItems: ProofItem[] = acceptedFiles.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name.trim() || "Workout proof",
        sourceFile: file,
        normalizedFile: null,
        previewUrl: URL.createObjectURL(file),
        status: "queued",
        progress: 0,
        loadedBytes: 0,
        totalBytes: file.size,
        error: null,
        retryable: false,
        proofImageId: null,
      }));

      updateItems((current) => [...current, ...newItems]);
      queuedIdsRef.current.push(...newItems.map((item) => item.id));
      setSelectionError(
        selectedFiles.length > acceptedFiles.length
          ? `Only ${remainingSlots} more photo${
              remainingSlots === 1 ? "" : "s"
            } could be added. The limit is ${MAX_PROOF_FILES}.`
          : null,
      );
      setSubmitError(null);
      setDraftNotice(null);
      setCheckingEntryId(null);
      setSaveStatus("idle");
      pumpQueueRef.current();
    },
    [updateItems],
  );

  const handleCameraChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  };

  const handleUploadChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = "";
  };

  const retryItem = useCallback(
    (id: string) => {
      if (pendingIntentRef.current) return;
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item || item.status !== "error" || !item.retryable) return;

      updateItem(id, (current) => ({
        ...current,
        status: "queued",
        progress: 0,
        loadedBytes: 0,
        error: null,
        retryable: false,
        proofImageId: null,
      }));
      if (!queuedIdsRef.current.includes(id)) queuedIdsRef.current.push(id);
      setSelectionError(null);
      pumpQueueRef.current();
    },
    [updateItem],
  );

  const removeItem = useCallback(
    (id: string) => {
      if (pendingIntentRef.current) return;
      const item = itemsRef.current.find((candidate) => candidate.id === id);
      if (!item) return;

      abortControllersRef.current.get(id)?.abort();
      uploadCancelsRef.current.get(id)?.();
      queuedIdsRef.current = queuedIdsRef.current.filter(
        (queuedId) => queuedId !== id,
      );
      updateItems((current) =>
        current.filter((candidate) => candidate.id !== id),
      );
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      setSelectionError(null);
      setSubmitError(null);
    },
    [updateItems],
  );

  const readyProofImageIds = useMemo(
    () =>
      proofItems.flatMap((item) =>
        item.status === "ready" && item.proofImageId ? [item.proofImageId] : [],
      ),
    [proofItems],
  );
  const shouldValidateProofImages =
    submitCount > 0 || Boolean(errors.proofImageIds);

  useEffect(() => {
    setValue("proofImageIds", readyProofImageIds, {
      shouldValidate: shouldValidateProofImages,
    });
  }, [readyProofImageIds, setValue, shouldValidateProofImages]);

  useEffect(() => {
    const validationStatus = entryStatus.data?.validationStatus;
    if (!validationStatus || !checkingEntryId) return;
    if (validationStatus === "NOT_CHECKED" || validationStatus === "PENDING") {
      return;
    }

    setCheckingEntryId(null);
    setSaveStatus(
      validationStatus === "VERIFIED"
        ? "saved"
        : validationStatus === "REJECTED"
          ? "rejected"
          : "needs-review",
    );
  }, [checkingEntryId, entryStatus.data?.validationStatus]);

  const restoreRetryDetails = useCallback(() => {
    const intent = pendingIntentRef.current;
    if (!intent) return;
    reset({
      ...defaultValues,
      ...intent.values,
      proofImageIds: intent.proofImageIds,
    });
    setSubmitError(
      "Original retry details restored. Select Retry save to confirm the workout.",
    );
  }, [reset]);

  const resetAfterAcknowledgedSave = useCallback(() => {
    abortControllersRef.current.forEach((controller) => controller.abort());
    uploadCancelsRef.current.forEach((cancel) => cancel());
    abortControllersRef.current.clear();
    uploadCancelsRef.current.clear();
    queuedIdsRef.current = [];
    itemsRef.current.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    updateItems(() => []);
    pendingIntentRef.current = null;
    setHasPendingIntent(false);
    if (athleteId) clearPersistedDraft(athleteId);
    clientSubmissionIdRef.current = crypto.randomUUID();
    reset({ ...defaultValues, date: getTodayString() });
    setProofInputKey((current) => current + 1);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    setSelectionError(null);
    setSubmitError(null);
    setDraftNotice(null);
  }, [athleteId, reset, updateItems]);

  const onSubmit = async (values: FormValues) => {
    if (submitLockRef.current) return;

    const currentItems = itemsRef.current;
    if (currentItems.length === 0) {
      setSubmitError("Add at least one proof photo before saving.");
      return;
    }
    if (
      currentItems.some((item) => item.status !== "ready" || !item.proofImageId)
    ) {
      setSubmitError(
        "Wait for every retained photo to say Photo uploaded, or remove failed photos.",
      );
      return;
    }

    const currentIntent: SubmissionIntent = {
      values: toDraftValues(values),
      proofImageIds: currentItems.flatMap((item) =>
        item.proofImageId ? [item.proofImageId] : [],
      ),
    };
    const pendingIntent = pendingIntentRef.current;
    if (pendingIntent && !sameSubmissionIntent(pendingIntent, currentIntent)) {
      setSubmitError(
        "These details changed after an interrupted save. Restore the original details before retrying so Rowbook cannot create a duplicate.",
      );
      return;
    }

    const intent = pendingIntent ?? currentIntent;
    pendingIntentRef.current = intent;
    setHasPendingIntent(true);
    persistCurrentDraft();
    submitLockRef.current = true;
    setSubmitError(null);
    setDraftNotice(null);
    setSaveStatus("saving");

    try {
      const result = await createEntry({
        clientSubmissionId: ensureClientSubmissionId(),
        activityType: intent.values.activityType,
        date: intent.values.date as unknown as Date,
        minutes: intent.values.minutes,
        distance: intent.values.distanceKm,
        avgHr: intent.values.avgHr ?? null,
        notes: intent.values.notes?.trim() || undefined,
        proofImageIds: intent.proofImageIds,
        proofOcr: null,
      });

      resetAfterAcknowledgedSave();
      if (
        result.entry.validationStatus === "PENDING" ||
        result.entry.validationStatus === "NOT_CHECKED"
      ) {
        setCheckingEntryId(result.entry.id);
        setSaveStatus("checking");
      } else {
        setCheckingEntryId(null);
        setSaveStatus(
          result.entry.validationStatus === "VERIFIED"
            ? "saved"
            : result.entry.validationStatus === "REJECTED"
              ? "rejected"
              : "needs-review",
        );
      }

      void Promise.allSettled([
        utils.athlete.getDashboard.invalidate(),
        utils.athlete.getHistory.invalidate(),
        utils.athlete.getHistoryWithEntries.invalidate(),
        utils.athlete.getWeekDetail.invalidate(),
        utils.athlete.getLeaderboard.invalidate(),
      ]);
    } catch {
      setSaveStatus("idle");
      setSubmitError(
        "Rowbook could not confirm whether the save finished. Retry this exact workout; the same submission ID prevents a duplicate.",
      );
      persistCurrentDraft();
    } finally {
      submitLockRef.current = false;
    }
  };

  const busyPhotoCount = proofItems.filter((item) =>
    ["queued", "preparing", "uploading", "confirming"].includes(item.status),
  ).length;
  const failedPhotoCount = proofItems.filter(
    (item) => item.status === "error",
  ).length;
  const allRetainedPhotosReady =
    proofItems.length > 0 && readyProofImageIds.length === proofItems.length;
  const saveIsBusy = saveStatus === "saving" || isSubmitting;
  const proofActionsDisabled = saveIsBusy || hasPendingIntent;
  const submitDisabled =
    saveIsBusy || (proofItems.length > 0 && !allRetainedPhotosReady);
  const submitLabel = saveIsBusy
    ? "Saving workout…"
    : hasPendingIntent
      ? "Retry save"
      : busyPhotoCount > 0
        ? "Finish uploads to save"
        : "Save workout";

  return (
    <form className="space-y-7" onSubmit={handleSubmit(onSubmit)} noValidate>
      <fieldset className="space-y-3" disabled={saveIsBusy}>
        <legend className="text-sm font-medium text-foreground">
          Activity type
        </legend>
        <div className="flex flex-wrap gap-2">
          {ActivityTypeValues.map((type) => (
            <Pill
              key={type}
              type="button"
              className="min-h-11"
              isActive={activityType === type}
              aria-pressed={activityType === type}
              onClick={() =>
                setValue("activityType", type, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            >
              <ActivityIcon type={type} />
              {ACTIVITY_TYPE_LABELS[type]}
            </Pill>
          ))}
        </div>
        {errors.activityType ? (
          <p
            id="activity-type-error"
            role="alert"
            className="text-xs text-rose-600"
          >
            {errors.activityType.message}
          </p>
        ) : null}
      </fieldset>

      <section className="space-y-3" aria-labelledby="proof-label">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <Label
              id="proof-label"
              htmlFor="proof"
              className="text-default-700"
            >
              Proof of workout
            </Label>
            <p
              id="proof-hint"
              className="mt-1 text-xs leading-relaxed text-default-500"
            >
              Add up to {MAX_PROOF_FILES} photos. HEIC, HEIF, JPEG, PNG, and
              WebP are prepared before upload.
            </p>
          </div>
          <p className="text-xs font-medium text-default-600">
            {proofItems.length} of {MAX_PROOF_FILES} photos
          </p>
        </div>

        <input
          key={`camera-${proofInputKey}`}
          id="proof-camera"
          ref={cameraInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          multiple
          onChange={handleCameraChange}
          className="sr-only"
          tabIndex={-1}
          aria-label="Take a photo of the workout screen"
          aria-describedby="proof-hint"
          disabled={
            proofActionsDisabled || proofItems.length >= MAX_PROOF_FILES
          }
        />
        <input
          key={`upload-${proofInputKey}`}
          id="proof"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
          multiple
          onChange={handleUploadChange}
          ref={uploadInputRef}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose workout screenshots"
          aria-describedby="proof-hint"
          disabled={
            proofActionsDisabled || proofItems.length >= MAX_PROOF_FILES
          }
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={
              proofActionsDisabled || proofItems.length >= MAX_PROOF_FILES
            }
            onClick={() => cameraInputRef.current?.click()}
          >
            Take photo of screen
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            disabled={
              proofActionsDisabled || proofItems.length >= MAX_PROOF_FILES
            }
            onClick={() => uploadInputRef.current?.click()}
          >
            Choose screenshots
          </Button>
        </div>

        {selectionError ? (
          <p role="alert" className="text-sm leading-relaxed text-rose-600">
            {selectionError}
          </p>
        ) : null}
        {errors.proofImageIds ? (
          <p role="alert" className="text-sm leading-relaxed text-rose-600">
            {errors.proofImageIds.message}
          </p>
        ) : null}
        {draftNotice ? (
          <p
            role="status"
            className="rounded-xl bg-primary-50 px-4 py-3 text-sm leading-relaxed text-primary-800"
          >
            {draftNotice}
          </p>
        ) : null}

        {proofItems.length > 0 ? (
          <ul className="grid gap-3" aria-label="Proof photos">
            {proofItems.map((item) => (
              <ProofUploadItem
                key={item.id}
                name={item.name}
                previewUrl={item.previewUrl}
                status={item.status}
                progress={item.progress}
                loadedBytes={item.loadedBytes}
                totalBytes={item.totalBytes}
                error={item.error}
                retryable={item.retryable}
                actionsDisabled={proofActionsDisabled}
                onRetry={() => retryItem(item.id)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm leading-relaxed text-default-500">
            Photograph the full workout screen, or choose screenshots from
            Concept2, Strava, Garmin, or another training app.
          </p>
        )}

        <p className="sr-only" role="status" aria-live="polite">
          {busyPhotoCount > 0
            ? `${busyPhotoCount} photo${busyPhotoCount === 1 ? "" : "s"} still uploading.`
            : failedPhotoCount > 0
              ? `${failedPhotoCount} photo${failedPhotoCount === 1 ? "" : "s"} need attention.`
              : readyProofImageIds.length > 0
                ? `${readyProofImageIds.length} photo${readyProofImageIds.length === 1 ? "" : "s"} ready.`
                : "No proof photos selected."}
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date" className="text-default-700">
            Date
          </Label>
          <Input
            id="date"
            type="date"
            max={today}
            disabled={saveIsBusy}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? "date-error" : undefined}
            {...register("date")}
          />
          {errors.date ? (
            <p id="date-error" role="alert" className="text-xs text-rose-600">
              {errors.date.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="minutes" className="text-default-700">
            Minutes
          </Label>
          <Input
            id="minutes"
            type="number"
            min={1}
            inputMode="numeric"
            disabled={saveIsBusy}
            aria-invalid={Boolean(errors.minutes)}
            aria-describedby={errors.minutes ? "minutes-error" : undefined}
            {...register("minutes")}
          />
          {errors.minutes ? (
            <p
              id="minutes-error"
              role="alert"
              className="text-xs text-rose-600"
            >
              {errors.minutes.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="distanceKm" className="text-default-700">
            Distance (km){activityType === "OTHER" ? " (optional)" : ""}
          </Label>
          <Input
            id="distanceKm"
            type="number"
            min={activityType === "OTHER" ? 0 : 0.001}
            step="0.001"
            max={500}
            inputMode="decimal"
            disabled={saveIsBusy}
            aria-invalid={Boolean(errors.distanceKm)}
            aria-describedby={errors.distanceKm ? "distance-error" : undefined}
            {...register("distanceKm")}
          />
          {errors.distanceKm ? (
            <p
              id="distance-error"
              role="alert"
              className="text-xs text-rose-600"
            >
              {errors.distanceKm.message}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="avgHr" className="text-default-700">
            Average HR (optional)
          </Label>
          <Input
            id="avgHr"
            type="number"
            min={30}
            max={220}
            inputMode="numeric"
            disabled={saveIsBusy}
            aria-invalid={Boolean(errors.avgHr)}
            aria-describedby={errors.avgHr ? "average-hr-error" : undefined}
            {...register("avgHr")}
          />
          {errors.avgHr ? (
            <p
              id="average-hr-error"
              role="alert"
              className="text-xs text-rose-600"
            >
              {errors.avgHr.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="text-default-700">
          Notes (optional)
        </Label>
        <Textarea
          id="notes"
          placeholder="Add context for your coach"
          maxLength={280}
          disabled={saveIsBusy}
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={errors.notes ? "notes-error" : "notes-hint"}
          {...register("notes")}
        />
        <p id="notes-hint" className="text-xs text-default-500">
          Up to 280 characters.
        </p>
        {errors.notes ? (
          <p id="notes-error" role="alert" className="text-xs text-rose-600">
            {errors.notes.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="submit"
            className="min-h-11 w-full sm:w-auto"
            disabled={submitDisabled}
          >
            {submitLabel}
          </Button>
          <p className="text-xs leading-relaxed text-default-500">
            Entries lock every Sunday at 8:00 PM ET. Photo checking happens
            after the workout is saved and never changes your entered fields.
          </p>
        </div>

        {submitError ? (
          <div
            role="alert"
            className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-relaxed text-rose-700"
          >
            <p>{submitError}</p>
            {hasPendingIntent ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-11"
                onClick={restoreRetryDetails}
              >
                Restore retry details
              </Button>
            ) : null}
          </div>
        ) : null}
        {saveStatus === "checking" ? (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-800"
          >
            <span className="font-semibold">Workout saved.</span> Checking photo
            in the background.
          </div>
        ) : saveStatus === "saved" ? (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          >
            Workout saved. Photo verified.
          </div>
        ) : saveStatus === "needs-review" ? (
          <div
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span className="font-semibold">Workout saved.</span> A coach may need
            to review the photo.
          </div>
        ) : saveStatus === "rejected" ? (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            <span className="font-semibold">Workout saved, but the proof was rejected.</span>{" "}
            Open your history for the coach&apos;s reason.
          </div>
        ) : null}
      </div>
    </form>
  );
};
