# Shared Types and Utilities Plan

This package is the single source of truth for types, enums, and validation.
Frontend and backend must import from here to keep everything type-safe.

## Goals

- One schema for each domain object
- Zod schemas generate TypeScript types
- Centralized date and week boundary utilities
- Shared constants for status and activity types

## Suggested Package Layout

- `schemas/`
  - `auth.ts` (session, login)
  - `entry.ts` (TrainingEntry input/output)
  - `proof.ts` (ProofImage and upload)
  - `weekly.ts` (WeeklyAggregate, requirements, exemptions)
  - `user.ts` (User, AthleteProfile)
- `enums/`
  - `role.ts`
  - `activity-type.ts`
  - `validation-status.ts`
- `utils/`
  - `week.ts` (weekStartAt, weekEndAt, isWithinWeek)
  - `time.ts` (timezone helpers)
- `constants/`
  - `limits.ts` (max upload size, allowed MIME types)

## Zod Schemas and Derived Types

Example approach:

- `const TrainingEntryInputSchema = z.object({ ... })`
- `type TrainingEntryInput = z.infer<typeof TrainingEntryInputSchema>`
- Reuse the same schema for client validation and API inputs

## Week Boundary Utilities

Functions:

- `getWeekStartAt(date, timezone)`
- `getWeekEndAt(weekStartAt, timezone)`
- `isWithinActiveWeek(date, timezone)`

All backend and frontend uses these to avoid drift.

## Status Mapping

Provide UI labels and colors for:

- `NOT_CHECKED`, `PENDING`, `VERIFIED`, `REJECTED`,
  `EXTRACTION_INCOMPLETE`

This keeps status logic consistent across the app.
