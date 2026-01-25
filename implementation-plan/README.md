# Implementation Plan: Rowbook OYO Minutes App

This folder contains the detailed, modular implementation plan split by concern
so that multiple agents can work in parallel without conflict:

- `backend/README.md` for API, data model, jobs, and services
- `frontend/README.md` for UI/UX and client architecture
- `shared/README.md` for shared types, schemas, and utilities
- `infra/README.md` for deployment, environment, and operations
- `testing/README.md` for quality and test strategy

## Constraints (from product spec)

- Database must be Supabase Postgres
- ORM must be Prisma
- Deployment must be on Vercel
- Week boundary: Sunday 6:00 PM America/New_York
- Proof images are required on upload but not validated yet
- Proof images are deleted 7 days after weekly cutoff

## Architecture Summary (Option A)

Single Next.js app deployed to Vercel, with a clean separation between
frontend (App Router) and backend (tRPC + services). All code is TypeScript.

Key choices:

- Next.js (App Router) for UI, server actions, and route handlers
- tRPC for end-to-end type-safe API
- Prisma for all DB access to Supabase
- Supabase Storage for proof images (private bucket + signed URLs)
- Vercel Cron for weekly aggregation, email, and image cleanup
- Zod for runtime validation, with types derived from schemas

## Modularity and Type Safety Principles

- Domain-first modules: each core feature has its own folder with
  DTOs, validation, service, repository, and API router.
- Shared schemas live in `packages/shared` and are the single source of truth.
- No ad-hoc JSON: all requests and responses are validated with Zod.
- Time and week boundary logic is centralized in shared utilities.
- UI uses shared enums and types for activity types and validation statuses.

## Proposed Repository Layout

This layout keeps frontend and backend isolated while remaining a single Vercel
deployable app.

- `apps/web` (Next.js)
  - `src/app` routes
  - `src/components` UI components
  - `src/server` backend services and tRPC routers
  - `src/db` Prisma client and repositories
  - `src/lib` utilities
- `packages/shared` (schemas, constants, date utilities)
- `packages/ui` (design system, reusable UI components)
- `packages/config` (eslint, tsconfig, prettier configs)

If you want to keep a single-package repo at first, use the same internal
structure under `src/` and move to `packages/` later without breaking APIs.

## Workstreams and Milestones (Detailed)

1. Project foundation
   - Initialize repo with TypeScript, Next.js, Prisma, and Tailwind
   - Create shared schema package and domain enums
   - Configure Supabase connection and Prisma migrations

2. Auth and roster management
   - Implement whitelist-based login
   - Build admin roster management in Supabase (manual)
   - Add role-based access utilities

3. Training entry flow
   - Athlete log form and entry list
   - Proof image upload (required, no validation yet)
   - Lock edits at weekly cutoff

4. Weekly aggregation
   - Compute weekly totals per athlete
   - Store and cache `WeeklyAggregate`
   - Leaderboard and team overview screens

5. Coach tools
   - Team overview and athlete detail screens
   - Exemption management
   - Validation override UI (placeholder status for now)

6. Email automation
   - Weekly recap email
   - Vercel Cron schedule at Sunday 6pm ET
   - Basic delivery logging

7. Proof validation pipeline (placeholder now)
   - Job queue table and status state machine
   - "Not checked" initial path
   - OCR integration added later behind a feature flag

8. Analytics and reporting
   - Per-athlete trends and team trends
   - Export to CSV
   - Additional charts for time, distance, and HR patterns

9. Hardening and observability
   - Error tracking, monitoring, rate limits
   - Security review, audit logs
   - Performance and UX polish

## Proof Validation Placeholder (Current Phase)

For now, athletes must upload a proof image, but no OCR checks are performed.
The backend sets `validation_status = not_checked` and the UI displays
"Not checked" with a neutral badge. The pipeline interface exists so that
OCR can be added later without changing the entry flow.

See `backend/README.md` for the pipeline interface and job table.

## What to Read Next

- `frontend/README.md` for mobile-first UI and data visualization plans
- `backend/README.md` for API, modules, and data model
- `shared/README.md` for type-safe schema and utilities
