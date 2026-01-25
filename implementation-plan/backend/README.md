# Backend Implementation Plan

This plan covers API design, services, data model, jobs, and storage. It is
written to enable independent backend work without conflicting with frontend.

## Goals

- Fully type-safe backend (TypeScript + Zod + tRPC)
- Modular services with clear interfaces
- Prisma as the only DB access layer
- Supabase Storage for proof images with signed URLs
- Clean separation between domain logic and transport
- Cron-driven automation for weekly aggregation and cleanup

## Tech Stack

- Next.js route handlers + tRPC routers
- Prisma (Supabase Postgres)
- Zod for validation and shared schemas
- Supabase Storage (private bucket)
- Vercel Cron for scheduled jobs
- Email provider SDK (Resend or Postmark)

## Backend Layout (apps/web)

- `src/server`
  - `routers/` tRPC routers by domain
  - `services/` domain logic (pure, testable)
  - `repositories/` Prisma queries and persistence
  - `jobs/` cron tasks and background processing
  - `auth/` session, whitelist, and RBAC utilities
  - `storage/` Supabase Storage helpers
- `src/db`
  - `prisma/` schema and migrations
  - `client.ts` Prisma client singleton

## Domain Modules (Responsibilities)

1. Auth
   - Whitelist-based login
   - Role resolution (athlete vs coach)
   - Session creation and validation

2. Athlete and team management
   - Read-only roster and team membership
   - Team timezone defaults to America/New_York

3. Training entries
   - Create, edit, delete entries within active week
   - Enforce weekly cutoff lock
   - Require proof image on create

4. Proof images
   - Generate signed upload URLs
   - Persist proof metadata
   - Enforce file size and MIME types
   - Delete after cutoff plus 7 days

5. Weekly aggregation
   - Aggregate entries into `WeeklyAggregate`
   - Compute status: met, not_met, exempt
   - Cache results per week for fast UI

6. Requirements and exemptions
   - Weekly required minutes per team
   - Exempt athletes for a week

7. Notifications
   - Weekly recap email generation and send

8. Audit and compliance
   - Audit log for entry changes and validation overrides

## Prisma Data Model (Detailed)

Enums:

- `Role`: `ATHLETE`, `COACH`, `ADMIN`
- `ActivityType`: `ERG`, `RUN`, `CYCLE`, `SWIM`, `OTHER`
- `ValidationStatus`: `NOT_CHECKED`, `PENDING`, `VERIFIED`, `REJECTED`,
  `EXTRACTION_INCOMPLETE`
- `EntryStatus`: `ACTIVE`, `LOCKED`

Tables (key fields):

- `User`:
  - `id`, `email`, `name`, `role`, `status`, `createdAt`
- `Team`:
  - `id`, `name`, `timezone`
- `AthleteProfile`:
  - `userId`, `teamId`, `notes`, `createdAt`
- `WeeklyRequirement`:
  - `teamId`, `weekStartAt`, `weekEndAt`, `requiredMinutes`
- `Exemption`:
  - `athleteId`, `weekStartAt`, `reason`, `createdBy`
- `TrainingEntry`:
  - `athleteId`, `activityType`, `date`, `minutes`, `distance`, `avgHr`,
    `notes`, `proofImageId`, `validationStatus`, `entryStatus`,
    `weekStartAt`, `lockedAt`, `createdAt`, `updatedAt`
- `ProofImage`:
  - `athleteId`, `storagePath`, `uploadedAt`, `deleteAfter`,
    `extractedFields`, `validationStatus`, `reviewedBy`
- `WeeklyAggregate`:
  - `athleteId`, `weekStartAt`, `weekEndAt`, `totalMinutes`,
    `activityTypes`, `hasHrData`, `status`
- `AuditLog`:
  - `actorId`, `entityType`, `entityId`, `action`, `before`, `after`,
    `createdAt`
- `ProofExtractionJob`:
  - `proofImageId`, `status`, `attempts`, `lockedAt`, `lastError`,
    `createdAt`, `updatedAt`

Indexes:

- `TrainingEntry`: `(athleteId, weekStartAt)`
- `WeeklyAggregate`: `(athleteId, weekStartAt)` unique
- `ProofImage`: `(athleteId, deleteAfter)`
- `Exemption`: `(athleteId, weekStartAt)` unique

## Time and Week Boundary Utilities

Shared utility calculates `weekStartAt` and `weekEndAt` using
America/New_York. All entry creation and aggregation uses this utility.

Rules:

- A week starts Sunday 6:00 PM ET
- Entries created after 6:00 PM count toward the next week
- Edits lock at the boundary of the active week

## API Design (tRPC Routers)

Example routers and procedures:

- `auth`
  - `getSession`
  - `login` (email + password)
- `athlete`
  - `getDashboard`
  - `getHistory`
  - `createEntry`
  - `updateEntry`
  - `deleteEntry`
- `coach`
  - `getTeamOverview`
  - `getAthleteDetail`
  - `setWeeklyRequirement`
  - `setExemption`
  - `overrideValidationStatus`
- `proof`
  - `createUploadUrl`
  - `confirmUpload`
  - `getSignedViewUrl`
- `reporting`
  - `getTeamTrends`
  - `exportCsv`

Every procedure uses Zod schemas from `packages/shared`.

## File Upload Flow (Required, No OCR Yet)

1. Client requests signed upload URL
2. Uploads image directly to Supabase Storage
3. Client confirms upload with `proofImageId`
4. Entry is created with `validation_status = NOT_CHECKED`
5. Job is queued in `ProofExtractionJob` with `status = NOT_CHECKED`

The OCR pipeline is intentionally a stub. A later phase will replace
`NOT_CHECKED` with real extraction and comparison logic.

## Weekly Jobs (Vercel Cron)

1. Sunday 6:00 PM ET
   - Compute weekly aggregates
   - Generate leaderboard email
2. Daily cleanup
   - Delete proof images where `deleteAfter <= now`
3. Optional nightly re-aggregation
   - Ensure totals are consistent if late edits occurred

## Access Control

- Session-based auth
- Server-side role checks in tRPC middleware
- All data access is filtered by role:
  - Athletes only access their own data
  - Coaches access full team data

## Observability

- Error tracking (Sentry)
- Structured logs for jobs and uploads
- Audit log for data changes

## Backward-Compatible Extension Points

These are intended for future additions:

- OCR provider adapter interface
- Proof validation strategy interface
- Multi-team support
- Additional activity types or metrics
