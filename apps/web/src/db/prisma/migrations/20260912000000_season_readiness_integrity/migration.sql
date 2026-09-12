-- Additive data-integrity, review-concurrency, job-recovery, and recap-delivery state.
BEGIN;

CREATE TYPE "WeeklyRecapDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN');

ALTER TABLE "Team"
  ADD COLUMN "weeklyRecapEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ProofImage"
  ADD COLUMN "clientSubmissionId" TEXT,
  ADD COLUMN "originalFileName" TEXT,
  ADD COLUMN "declaredSize" INTEGER,
  ADD COLUMN "declaredMimeType" TEXT,
  ADD COLUMN "verifiedSize" INTEGER,
  ADD COLUMN "verifiedMimeType" TEXT,
  ADD COLUMN "contentSha256" TEXT,
  ADD COLUMN "attachedAt" TIMESTAMP(3);

-- Preserve immutable consumption metadata for existing evidence. The production
-- preflight found no duplicate legacy pointers or conflicting direct links.
UPDATE "ProofImage" proof
SET "trainingEntryId" = entry.id,
    "attachedAt" = COALESCE(proof."uploadedAt", proof."createdAt")
FROM "TrainingEntry" entry
WHERE entry."proofImageId" = proof.id
  AND proof."trainingEntryId" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "TrainingEntry" duplicate
    WHERE duplicate."proofImageId" = proof.id
      AND duplicate.id <> entry.id
  );

UPDATE "ProofImage"
SET "attachedAt" = COALESCE("uploadedAt", "createdAt")
WHERE "trainingEntryId" IS NOT NULL
  AND "attachedAt" IS NULL;

ALTER TABLE "TrainingEntry"
  ADD COLUMN "clientSubmissionId" TEXT,
  ADD COLUMN "submissionHash" TEXT,
  ADD COLUMN "evidenceRevision" INTEGER,
  ADD COLUMN "evidenceKey" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT;

-- Preserve completed legacy coach decisions. AuditLog is authoritative here:
-- production has one matching latest OVERRIDE_VALIDATION decision for every
-- surviving entry whose linked proof carries a reviewer.
WITH latest_review AS (
  SELECT DISTINCT ON (audit."entityId")
    audit."entityId" AS "entryId",
    audit."actorId" AS "reviewedById",
    audit."createdAt" AS "reviewedAt",
    audit."after" ->> 'validationStatus' AS "validationStatus"
  FROM "AuditLog" audit
  INNER JOIN "TrainingEntry" entry ON entry.id = audit."entityId"
  INNER JOIN "User" reviewer ON reviewer.id = audit."actorId"
  WHERE audit."entityType" = 'TRAINING_ENTRY'
    AND audit."action" = 'OVERRIDE_VALIDATION'
  ORDER BY audit."entityId", audit."createdAt" DESC, audit.id DESC
)
UPDATE "TrainingEntry" entry
SET "reviewedAt" = latest_review."reviewedAt",
    "reviewedById" = latest_review."reviewedById"
FROM latest_review
WHERE entry.id = latest_review."entryId"
  AND entry."reviewedAt" IS NULL
  AND entry."reviewedById" IS NULL
  AND latest_review."validationStatus" IN ('VERIFIED', 'REJECTED')
  AND entry."validationStatus"::text = latest_review."validationStatus";

DO $$
BEGIN
  IF EXISTS (
    WITH latest_review AS (
      SELECT DISTINCT ON (audit."entityId")
        audit."entityId" AS "entryId",
        audit."actorId" AS "reviewedById",
        audit."createdAt" AS "reviewedAt",
        audit."after" ->> 'validationStatus' AS "validationStatus"
      FROM "AuditLog" audit
      INNER JOIN "TrainingEntry" entry ON entry.id = audit."entityId"
      INNER JOIN "User" reviewer ON reviewer.id = audit."actorId"
      WHERE audit."entityType" = 'TRAINING_ENTRY'
        AND audit."action" = 'OVERRIDE_VALIDATION'
      ORDER BY audit."entityId", audit."createdAt" DESC, audit.id DESC
    )
    SELECT 1
    FROM latest_review
    INNER JOIN "TrainingEntry" entry ON entry.id = latest_review."entryId"
    WHERE latest_review."validationStatus" IN ('VERIFIED', 'REJECTED')
      AND entry."validationStatus"::text = latest_review."validationStatus"
      AND (
        entry."reviewedAt" IS DISTINCT FROM latest_review."reviewedAt"
        OR entry."reviewedById" IS DISTINCT FROM latest_review."reviewedById"
      )
  ) THEN
    RAISE EXCEPTION 'Legacy workout review backfill did not preserve every eligible decision';
  END IF;
END $$;

CREATE TABLE "CoachTeamMembership" (
  "teamId" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachTeamMembership_pkey" PRIMARY KEY ("teamId", "coachId")
);

CREATE TABLE "WeeklyRecapDelivery" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "weekStartAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "WeeklyRecapDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "templateVersion" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3),
  "claimToken" TEXT,
  "provider" TEXT,
  "providerMessageId" TEXT,
  "sentAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WeeklyRecapDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceExtractionJob" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "clientSubmissionId" TEXT NOT NULL,
  "evidenceRevision" INTEGER NOT NULL,
  "evidenceKey" TEXT NOT NULL,
  "proofImageIds" TEXT[] NOT NULL,
  "entryId" TEXT,
  "referenceDate" TIMESTAMP(3) NOT NULL,
  "status" "ProofExtractionStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 10,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseExpiresAt" TIMESTAMP(3),
  "claimToken" TEXT,
  "result" JSONB,
  "resultMeta" JSONB,
  "provider" TEXT,
  "model" TEXT,
  "promptVersion" TEXT,
  "schemaVersion" TEXT,
  "durationMs" INTEGER,
  "failureCode" TEXT,
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EvidenceExtractionJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProofImage_storagePath_key" ON "ProofImage"("storagePath");
CREATE INDEX "ProofImage_trainingEntryId_idx" ON "ProofImage"("trainingEntryId");
CREATE INDEX "ProofImage_clientSubmissionId_idx" ON "ProofImage"("clientSubmissionId");
CREATE INDEX "ProofImage_athleteId_contentSha256_idx" ON "ProofImage"("athleteId", "contentSha256");
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ProofImage"
    WHERE "attachedAt" IS NOT NULL
      AND "contentSha256" IS NOT NULL
    GROUP BY "athleteId", "contentSha256"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate attached proof bytes must be resolved before enforcing evidence replay protection';
  END IF;
END $$;

CREATE UNIQUE INDEX "ProofImage_athleteId_contentSha256_attached_key"
  ON "ProofImage"("athleteId", "contentSha256")
  WHERE "attachedAt" IS NOT NULL AND "contentSha256" IS NOT NULL;
CREATE UNIQUE INDEX "TrainingEntry_evidenceKey_key" ON "TrainingEntry"("evidenceKey");
CREATE UNIQUE INDEX "TrainingEntry_athleteId_clientSubmissionId_key" ON "TrainingEntry"("athleteId", "clientSubmissionId");
CREATE INDEX "TrainingEntry_weekStartAt_validationStatus_date_idx" ON "TrainingEntry"("weekStartAt", "validationStatus", "date");
CREATE INDEX "CoachTeamMembership_coachId_idx" ON "CoachTeamMembership"("coachId");
CREATE UNIQUE INDEX "WeeklyRecapDelivery_teamId_weekStartAt_userId_key" ON "WeeklyRecapDelivery"("teamId", "weekStartAt", "userId");
CREATE INDEX "WeeklyRecapDelivery_status_nextAttemptAt_idx" ON "WeeklyRecapDelivery"("status", "nextAttemptAt");
CREATE INDEX "WeeklyRecapDelivery_status_leaseExpiresAt_idx" ON "WeeklyRecapDelivery"("status", "leaseExpiresAt");
CREATE UNIQUE INDEX "EvidenceExtractionJob_evidenceKey_key" ON "EvidenceExtractionJob"("evidenceKey");
CREATE UNIQUE INDEX "EvidenceExtractionJob_entryId_key" ON "EvidenceExtractionJob"("entryId");
CREATE UNIQUE INDEX "EvidenceExtractionJob_athleteId_clientSubmissionId_evidenceRevision_key" ON "EvidenceExtractionJob"("athleteId", "clientSubmissionId", "evidenceRevision");
CREATE INDEX "EvidenceExtractionJob_status_nextAttemptAt_leaseExpiresAt_priority_createdAt_idx" ON "EvidenceExtractionJob"("status", "nextAttemptAt", "leaseExpiresAt", "priority", "createdAt");

ALTER TABLE "TrainingEntry"
  ADD CONSTRAINT "TrainingEntry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CoachTeamMembership"
  ADD CONSTRAINT "CoachTeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachTeamMembership"
  ADD CONSTRAINT "CoachTeamMembership_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyRecapDelivery"
  ADD CONSTRAINT "WeeklyRecapDelivery_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyRecapDelivery"
  ADD CONSTRAINT "WeeklyRecapDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceExtractionJob"
  ADD CONSTRAINT "EvidenceExtractionJob_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceExtractionJob"
  ADD CONSTRAINT "EvidenceExtractionJob_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TrainingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Infer only relationships demonstrated by historical staff actions. The legacy
-- application did not store coach ownership, so role, account status, and email
-- domain alone are not authorization evidence. Ambiguous staff remain unassigned
-- until an operator explicitly grants a membership; ADMIN is not treated as an
-- implicit global role.
CREATE TEMP VIEW "_RowbookInferredCoachTeamMembership" AS
SELECT DISTINCT signal."teamId", signal."coachId"
FROM (
  -- Surviving coach decisions copied into the new review metadata above.
  SELECT profile."teamId", entry."reviewedById" AS "coachId"
  FROM "TrainingEntry" entry
  INNER JOIN "AthleteProfile" profile ON profile."userId" = entry."athleteId"
  WHERE entry."reviewedById" IS NOT NULL

  UNION ALL

  -- Legacy proof rows retain the reviewer even when an entry was later removed.
  SELECT profile."teamId", proof."reviewedById" AS "coachId"
  FROM "ProofImage" proof
  INNER JOIN "AthleteProfile" profile ON profile."userId" = proof."athleteId"
  WHERE proof."reviewedById" IS NOT NULL

  UNION ALL

  -- Audit JSON preserves the athlete for deleted historical entry decisions.
  SELECT profile."teamId", audit."actorId" AS "coachId"
  FROM "AuditLog" audit
  LEFT JOIN "TrainingEntry" entry ON entry.id = audit."entityId"
  INNER JOIN "AthleteProfile" profile
    ON profile."userId" = COALESCE(
      entry."athleteId",
      audit.after ->> 'athleteId',
      audit.before ->> 'athleteId'
    )
  WHERE audit."entityType" = 'TRAINING_ENTRY'
    AND audit.action IN ('OVERRIDE_VALIDATION', 'REVIEW_VALIDATION')

  UNION ALL

  SELECT profile."teamId", exemption."createdBy" AS "coachId"
  FROM "Exemption" exemption
  INNER JOIN "AthleteProfile" profile ON profile."userId" = exemption."athleteId"

  UNION ALL

  SELECT profile."teamId", override."createdBy" AS "coachId"
  FROM "AthleteWeeklyRequirementOverride" override
  INNER JOIN "AthleteProfile" profile ON profile."userId" = override."athleteId"

  UNION ALL

  -- Requirement and team-setting audits identify the team directly.
  SELECT
    COALESCE(
      requirement."teamId",
      audit.after ->> 'teamId',
      audit.before ->> 'teamId'
    ) AS "teamId",
    audit."actorId" AS "coachId"
  FROM "AuditLog" audit
  LEFT JOIN "WeeklyRequirement" requirement ON requirement.id = audit."entityId"
  WHERE audit."entityType" = 'WEEKLY_REQUIREMENT'

  UNION ALL

  SELECT team.id AS "teamId", audit."actorId" AS "coachId"
  FROM "AuditLog" audit
  INNER JOIN "Team" team ON team.id = audit."entityId"
  WHERE audit."entityType" = 'TEAM_SETTINGS'

  UNION ALL

  -- Use audit JSON for exemptions/overrides that no longer have a live row.
  SELECT profile."teamId", audit."actorId" AS "coachId"
  FROM "AuditLog" audit
  LEFT JOIN "Exemption" exemption ON exemption.id = audit."entityId"
  INNER JOIN "AthleteProfile" profile
    ON profile."userId" = COALESCE(
      exemption."athleteId",
      audit.after ->> 'athleteId',
      audit.before ->> 'athleteId'
    )
  WHERE audit."entityType" = 'EXEMPTION'

  UNION ALL

  SELECT profile."teamId", audit."actorId" AS "coachId"
  FROM "AuditLog" audit
  LEFT JOIN "AthleteWeeklyRequirementOverride" override ON override.id = audit."entityId"
  INNER JOIN "AthleteProfile" profile
    ON profile."userId" = COALESCE(
      override."athleteId",
      audit.after ->> 'athleteId',
      audit.before ->> 'athleteId'
    )
  WHERE audit."entityType" = 'ATHLETE_WEEKLY_REQUIREMENT_OVERRIDE'
) signal
INNER JOIN "Team" team ON team.id = signal."teamId"
INNER JOIN "User" coach ON coach.id = signal."coachId"
WHERE coach.role IN ('COACH', 'ADMIN')
  AND coach.status = 'ACTIVE';

INSERT INTO "CoachTeamMembership" ("teamId", "coachId")
SELECT "teamId", "coachId"
FROM "_RowbookInferredCoachTeamMembership"
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  ambiguous_staff_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "_RowbookInferredCoachTeamMembership" inferred
    LEFT JOIN "CoachTeamMembership" membership
      ON membership."teamId" = inferred."teamId"
      AND membership."coachId" = inferred."coachId"
    WHERE membership."coachId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Coach-team backfill omitted an inferred membership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "CoachTeamMembership" membership
    LEFT JOIN "_RowbookInferredCoachTeamMembership" inferred
      ON inferred."teamId" = membership."teamId"
      AND inferred."coachId" = membership."coachId"
    WHERE inferred."coachId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Coach-team backfill created a membership without historical evidence';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO ambiguous_staff_count
  FROM "User" coach
  WHERE coach.role IN ('COACH', 'ADMIN')
    AND coach.status = 'ACTIVE'
    AND NOT EXISTS (
      SELECT 1
      FROM "CoachTeamMembership" membership
      WHERE membership."coachId" = coach.id
    );

  IF ambiguous_staff_count > 0 THEN
    RAISE NOTICE '% active coach/admin account(s) require an explicit team assignment', ambiguous_staff_count;
  END IF;
END $$;

DROP VIEW "_RowbookInferredCoachTeamMembership";

-- The browser never queries app tables directly; server connections use a BYPASSRLS role.
-- Enabling RLS closes the existing PostgREST access granted to anon/authenticated roles.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AthleteProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyRequirement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Exemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AthleteWeeklyRequirementOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProofImage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConnectedAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExternalActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyAggregate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProofExtractionJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CoachTeamMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyRecapDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceExtractionJob" ENABLE ROW LEVEL SECURITY;

-- Rowbook uses its server-side Postgres connection for all application data.
-- Remove the broad Data API grants that were present in the live project,
-- including access to Prisma's migration ledger.
DO $$
BEGIN
  IF to_regprocedure('public.is_allowed_user_email(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.is_allowed_user_email(text) SET search_path = pg_catalog, public';
  END IF;
END $$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES REVOKE ALL PRIVILEGES ON FUNCTIONS FROM authenticated';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    UPDATE storage.buckets
    SET file_size_limit = 10485760,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
    WHERE id = 'proof-images';
  END IF;
END $$;

-- Vercel Hobby cron jobs cannot run more than once per day. Supabase Cron
-- dispatches the bounded extraction drain every five minutes instead. The
-- endpoints and bearer token are provisioned separately in Vault as
-- rowbook_proof_extraction_url, rowbook_proof_cleanup_url, rowbook_weekly_url,
-- rowbook_weekly_recap_delivery_url, and rowbook_cron_secret; no secret is stored
-- in migration history. Until the
-- corresponding endpoint and token exist, each scheduled query safely does nothing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron'
  ) AND EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net'
  ) AND EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'supabase_vault'
  ) THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;
    CREATE EXTENSION IF NOT EXISTS supabase_vault;

    PERFORM cron.schedule(
      'rowbook-proof-extraction-dispatch',
      '*/5 * * * *',
      $cron$
        SELECT net.http_post(
          url := config.endpoint,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || config.cron_secret
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 295000
        )
        FROM (
          SELECT
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_proof_extraction_url'
            ) AS endpoint,
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_cron_secret'
            ) AS cron_secret
        ) AS config
        WHERE config.endpoint IS NOT NULL
          AND config.cron_secret IS NOT NULL;
      $cron$
    );

    PERFORM cron.schedule(
      'rowbook-proof-cleanup-dispatch',
      '0 3 * * *',
      $cron$
        SELECT net.http_post(
          url := config.endpoint,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || config.cron_secret
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 295000
        )
        FROM (
          SELECT
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_proof_cleanup_url'
            ) AS endpoint,
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_cron_secret'
            ) AS cron_secret
        ) AS config
        WHERE config.endpoint IS NOT NULL
          AND config.cron_secret IS NOT NULL;
      $cron$
    );

    PERFORM cron.schedule(
      'rowbook-weekly-edt-dispatch',
      '0 0 * * *',
      $cron$
        SELECT net.http_post(
          url := config.endpoint,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || config.cron_secret
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 295000
        )
        FROM (
          SELECT
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_weekly_url'
            ) AS endpoint,
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_cron_secret'
            ) AS cron_secret
        ) AS config
        WHERE config.endpoint IS NOT NULL
          AND config.cron_secret IS NOT NULL;
      $cron$
    );

    PERFORM cron.schedule(
      'rowbook-weekly-est-dispatch',
      '0 1 * * *',
      $cron$
        SELECT net.http_post(
          url := config.endpoint,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || config.cron_secret
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 295000
        )
        FROM (
          SELECT
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_weekly_url'
            ) AS endpoint,
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_cron_secret'
            ) AS cron_secret
        ) AS config
        WHERE config.endpoint IS NOT NULL
          AND config.cron_secret IS NOT NULL;
      $cron$
    );

    -- The daily weekly route creates and sends the send-once rows before its
    -- best-effort aggregate repair. These delivery-only dispatches pick up PENDING and
    -- FAILED rows every five minutes during the 48-hour New York recap window.
    -- Supabase Cron runs in UTC: the window spans Monday/Tuesday, plus Wednesday
    -- 00:00-00:59 UTC while New York is on standard time.
    PERFORM cron.schedule(
      'rowbook-weekly-recap-retry-monday-tuesday',
      '*/5 * * * 1,2',
      $cron$
        SELECT net.http_post(
          url := config.endpoint,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || config.cron_secret
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 295000
        )
        FROM (
          SELECT
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_weekly_recap_delivery_url'
            ) AS endpoint,
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_cron_secret'
            ) AS cron_secret
        ) AS config
        WHERE config.endpoint IS NOT NULL
          AND config.cron_secret IS NOT NULL;
      $cron$
    );

    PERFORM cron.schedule(
      'rowbook-weekly-recap-retry-est-boundary',
      '*/5 0 * * 3',
      $cron$
        SELECT net.http_post(
          url := config.endpoint,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || config.cron_secret
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 295000
        )
        FROM (
          SELECT
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_weekly_recap_delivery_url'
            ) AS endpoint,
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'rowbook_cron_secret'
            ) AS cron_secret
        ) AS config
        WHERE config.endpoint IS NOT NULL
          AND config.cron_secret IS NOT NULL;
      $cron$
    );
  END IF;
END $$;

COMMIT;
