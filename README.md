# Rowing Team OYO Minutes App

This document describes the full application design and all parts that must be built. It is intentionally technology-agnostic, except for the required database, ORM, and deployment platform.

## Purpose

Provide a lightweight, mobile-first web application for a rowing team to log weekly on-your-own (OYO) training minutes, validate entries with proof images, and generate weekly recap/leaderboard views for athletes and coaches.

## Core Requirements (Given)

- Athletes log OYO training each week across multiple activity types (erg, run, cycle, swim, etc.).
- Each workout entry includes time, distance, average heart rate, and date.
- Each entry must include a proof image (photo/screenshot) that validates the manual input.
- Athletes can only see and edit their own training entries; editing locks at the weekly cutoff.
- Coaches/admins can see all training data, all proofs, and full weekly history per athlete.
- Coaches/admins can exempt an athlete from minutes for a specific week.
- Week boundary: Sunday at 8:00 PM America/New_York; the week runs from Sunday 8:00 PM to the following Sunday 8:00 PM. The weekly email sends at this cutoff, and entries created after 8:00 PM count toward the following week.
- Proof validation accepts entered minutes at or below the active workout time supported by the evidence. Underclaims keep the entered amount; distance, heart rate, and activity-category differences alone do not block approval.
- New submissions contribute to totals, targets, and rankings only after verification. Incomplete or uncertain evidence stays saved and visible for correction or review without earning credit. Existing submissions retain their previous credit rules and saved decisions.
- Proof images are retained for 7 days after the weekly cutoff, then deleted.
- Authentication is basic and restricted to a pre-approved email whitelist.
- Onboarding/offboarding is handled manually in Supabase.
- Database must be Supabase.
- Backend data access must be Prisma (type-safe ORM).
- Deployment must be on Vercel.

## Users and Roles

### Athlete
- Log their own training entries.
- Upload proof images.
- View their own weekly totals and history.
- View weekly leaderboard and other athletes’ weekly activity summaries (not detailed proofs).

### Coach / Admin
- View all athletes’ training entries and proofs.
- Set weekly minute requirements.
- Exempt athletes for specific weeks.
- Review and override proof validation.
- See per-athlete historical summaries.

### System (Automations)
- Weekly recap/leaderboard email.
- Validation pipeline for proof vs. manual inputs.

## High-Level Application Parts

### 1) Front-End (User Interface)
The application should be mobile-first, fast to load, and usable on desktop.

#### 1.1 Authentication & Access
- Login form (email + pre-generated password).
- Role-aware routing (athlete vs. coach).
- Basic account settings (password reset flow if needed).

#### 1.2 Athlete: Weekly Dashboard
- Current week requirement and personal progress.
- Quick-add workout entry.
- Recent entries list with validation status.
- “Proof pending / verified / needs review” indicators.

#### 1.3 Athlete: Log Workout
- Minimal form:
  - Activity type
  - Date
  - Time (minutes)
  - Distance
  - Average heart rate
  - Optional notes
- Proof upload (image or screenshot).
- Preview and confirm before submit.

#### 1.4 Athlete: Weekly History
- List of weeks with totals and status (met / not met / exempt).
- Tap into a week to see entries.

#### 1.5 Athlete: Weekly Leaderboard
- Rank by total minutes (descending).
- Color coding:
  - Green: met or exceeded requirement.
  - Red: did not meet requirement.
  - Grey: exempt.
- Icons for activity types completed in the week.
- Minimal visible stats per athlete (total minutes, activity icons, avg HR presence indicator).

#### 1.6 Coach: Team Overview
- Full weekly leaderboard with filters.
- Quick identification of missing minutes and missing proof.
- Toggle for showing exempt athletes at the bottom.

#### 1.7 Coach: Athlete Detail
- Weekly history timeline for a single athlete.
- Drill-down into entries with proof images.
- Validation status override.

#### 1.8 Coach: Weekly Settings
- Set/adjust weekly required minutes.
- Week boundary is fixed to Sunday 8:00 PM America/New_York.
- Mark exemptions for specific athletes.

#### 1.9 Shared UI Components
- Activity icon set.
- Week selector.
- Proof image viewer (zoom, rotate, download).
- Status badges (verified, pending, needs review).

## Back-End Modules

### 2) Authentication & Access Control
- User identity linked to email.
- Access restricted to a pre-approved email whitelist (no public sign-ups).
- Role assignment (athlete vs. coach).
- Access policies:
  - Athletes: only their own entries and proofs.
  - Coaches: full visibility.
- Basic password-based login; optional password reset and account recovery.

### 3) Athlete & Team Management
- Athlete profile (name, email, role, team).
- Roster list managed manually in Supabase (no self-onboarding).
- Ability to deactivate accounts (manual offboarding).

### 4) Training Entry Service
- Create/edit/delete entries by the athlete who owns them.
- Edit window is limited to the active week; entries lock at Sunday 8:00 PM America/New_York.
- Entries are assigned to weeks based on submission time relative to the Sunday 8:00 PM cutoff.
- Store:
  - Activity type
  - Date
  - Minutes
  - Distance
  - Average heart rate
  - Proof image reference
  - Validation status
  - Created/updated timestamps

### 5) Proof Validation Pipeline
Purpose: confirm a valid workout supports at least the claimed active minutes.

#### 5.1 Proof Upload Handling
- File upload and storage.
- File size limits and allowed formats.
- Virus/malware scanning if required.

#### 5.2 Evidence Extraction
- Extract relevant fields from the image (time, distance, activity type, HR, date).
- Store extracted data for comparison.

#### 5.3 Validation Rules
- Automatically approve entered minutes at or below supported whole active minutes. Exact active seconds take precedence over extracted minutes and are rounded down, never up; programmed rest does not count.
- Require a readable, matching workout date and evidence for one completed session. Conflicting dates/durations, low confidence (below 0.92), and validity concerns require review. Never add repeated totals from multiple screenshots.
- All existing activity categories are eligible. Distance, heart rate, and activity-category differences are informational and do not independently require review.
- Keep incomplete evidence saved for correction or review. For new submissions, pending, unchecked, incomplete, and rejected workouts earn no credit.
- Preserve historical processing: existing submissions use credit policy 1 (all non-rejected entries count); new submissions use policy 2 (verified entries only). Editing does not change an entry's policy, and rollout does not reprocess old proof or decisions.
- Athletes can reduce an overclaim to the supported minutes using the existing edit flow before coach review; saving re-evaluates the evidence.
- Reducing an approved claim or editing incidental details preserves its approval. Edits to coach-rejected time/date return for coach review and cannot automatically approve the rejected evidence.
- Block identical proof-image reuse by the same athlete. Different screenshots of the same workout are not yet detected across submissions.

#### 5.4 Manual Review Queue
- Coach review interface.
- Override and mark as verified or rejected.

### 6) Weekly Aggregation & Leaderboard
- Calculate weekly totals per athlete using each entry's credit policy: verified workouts only for new submissions, previous counting rules for existing submissions.
- Rank athletes by total minutes.
- Determine status: met / not met / exempt.
- Aggregate activity icons (unique types done that week).
- Aggregate HR indicator (whether HR data is present).
- Enforce weekly boundary at Sunday 8:00 PM America/New_York (Sunday → Sunday).

### 7) Weekly Requirements & Exemptions
- Store weekly required minutes per team.
- Exemption records (athlete, week, reason).
- Ensure exempt athletes appear in grey section.

### 8) Notifications & Email
- Weekly leaderboard email generation:
  - Every Sunday at 8:00 PM America/New_York (weekly cutoff).
  - Table of athletes, minutes, activity icons, HR indicator.
  - Color-coded row status.
- Opt-in/out rules if required.

### 9) Reporting & History
- Per-athlete weekly summaries.
- Team-level trend analytics (optional).
- Export functions (CSV) for coaches.

### 10) Audit & Compliance
- Log changes to entries and validation status.
- Track who verified or rejected proof.
- Auto-delete proof images 7 days after the weekly cutoff.

## Data Model (Logical)

### User
- id, name, email, role, status

### AthleteProfile
- user_id, team_id, jersey/notes (optional)

### Team
- id, name, timezone (America/New_York)

### WeeklyRequirement
- team_id, week_start_at, week_end_at, required_minutes

### Exemption
- athlete_id, week_start_at, reason, created_by

### TrainingEntry
- athlete_id
- activity_type
- date
- minutes
- distance
- avg_hr
- notes
- proof_image_id
- validation_status
- week_start_at (Sunday 8:00 PM boundary)
- locked_at
- created_at, updated_at

### ProofImage
- athlete_id
- file_path
- uploaded_at
- extracted_fields (time, distance, HR, date, type)
- validation_result
- reviewed_by (optional)
- delete_after (7 days after weekly cutoff)

### WeeklyAggregate
- athlete_id
- week_start_at, week_end_at
- total_minutes
- activity_types
- has_hr_data
- status (met / not met / exempt)

## Core Workflows

### Athlete Logs Workout
1. Athlete enters activity details and uploads proof.
2. Entry is saved as “pending verification” and remains visible without counting toward totals.
3. Validation approves supported minute claims, flags overclaims or uncertain evidence, and marks unreadable required evidence as extraction-incomplete. Athletes can edit overclaims; only verified entries count.
4. Entry is assigned to the week based on submission time; edits lock at Sunday 8:00 PM.

### Coach Reviews Proof
1. Coach opens review queue.
2. Compares extracted fields with entry.
3. Marks verified or rejected; rejection requires reason.

### Weekly Recap Email
1. Weekly aggregation computes totals.
2. Leaderboard is generated and sorted.
3. Email sends to all roster emails at Sunday 8:00 PM America/New_York.

## UI Content Requirements

### Leaderboard Row
- Athlete name
- Total minutes
- Activity icons (unique types for the week)
- HR indicator (if HR data exists)
- Status color (green/red/grey)

### Athlete Weekly Detail
- Day-by-day entries
- Each entry shows:
  - activity type
  - minutes
  - distance
  - avg HR
  - validation status
  - proof image

## Missing/Implicit Requirements to Decide

These should be finalized before implementation:

- Time/HR matching rules when the proof shows extra precision.
- Unit conventions per activity (km vs miles; meters vs yards; minutes vs hh:mm:ss).
- Handling of late submissions that belong to a previous week.
- Email deliverability requirements and branding.
- Storage limits for proof images and logging.
- Privacy policy and data retention rules for non-image data.

## Non-Functional Needs

- Mobile-first performance and minimal steps to log a workout.
- Secure access to proof images.
- Fast weekly aggregation for leaderboard and email.
- Reliable scheduled job execution at 8:00 PM Sunday (America/New_York).
- Automated image deletion 7 days after weekly cutoff.
- Simple onboarding/offboarding managed manually in Supabase.

## Deployment & Hosting

- Database: Supabase.
- ORM: Prisma (type-safe data access).
- Hosting: Vercel.

### Workout extraction providers

- New extraction requests use OpenAI `gpt-6-luna` by default. Set the server-only `OPENAI_API_KEY` in `apps/web/.env.local` for local Next.js development and in Vercel's environment variables for deployment. The standalone provider benchmark loads the repository-root `.env`.
- Optional overrides: `OPENAI_MODEL` and `PROOF_EXTRACTION_PROVIDER=openai|gemini`. To explicitly use Gemini, set the provider to `gemini` and supply `GEMINI_API_KEY`; `GEMINI_MODEL` defaults to `gemini-3.8-flash`. There is no automatic provider fallback.
- The same evidence schema, active-time rules, and deterministic validation apply to both providers. OpenAI requests disable response storage, use low reasoning effort and high-detail image input, and cap output (including reasoning) at 2,000 tokens. Usage metadata is retained with each new extraction.
- Run `npm run test:provider` for paid, read-only checks of the photos in `tests/test-photos`. It creates no workouts, does not access the database, and reports measured tokens plus a 500-workout cost projection for the default OpenAI model. Original photos are unchanged; HEIC conversion uses temporary files. No automatic retries are made by this benchmark.
- Provider changes do not reprocess historical workouts. Apply pending Prisma migrations before deploying the corresponding application changes.

## Milestones (Suggested)

1. Authentication + roster import + basic athlete dashboards.
2. Training entry + proof upload + basic leaderboard.
3. Proof validation pipeline + coach review tools.
4. Weekly email automation.
5. Historical reporting + export features.
