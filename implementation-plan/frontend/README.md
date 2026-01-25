# Frontend Implementation Plan

This plan focuses on a mobile-first, visually appealing UI that still exposes
rich data and deep weekly history. It is structured for a separate frontend
agent to implement without touching backend code.

## Goals

- Mobile-first, fast, and highly usable
- Strong visual insights into progress and trends
- Access to detailed per-athlete and per-week data
- Type-safe data fetching with shared schemas

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Design system based on a small set of primitives (cards, badges, charts)
- React Hook Form + Zod for form validation
- tRPC + React Query for data fetching
- Charting: Recharts or Visx (lightweight)

## App Information Architecture

Public:

- `/login`
- `/reset-password` (optional)

Athlete:

- `/athlete` dashboard
- `/athlete/log` add entry
- `/athlete/history` weekly history list
- `/athlete/week/[weekStart]` week detail
- `/athlete/leaderboard` weekly leaderboard

Coach:

- `/coach` team overview
- `/coach/athlete/[id]` athlete detail
- `/coach/review` validation review queue
- `/coach/settings` weekly requirements and exemptions

## Global Layout and Navigation

Mobile:

- Bottom navigation: Dashboard, Log, History, Leaderboard
- Sticky top bar with week selector

Desktop:

- Left sidebar navigation
- Main content area with cards and charts

## Core Screens (Detailed)

### Athlete Dashboard

Purpose: quick weekly status and motivation.

Key components:

- Weekly progress ring (minutes vs required)
- This week summary cards (minutes, distance, sessions, HR presence)
- Recent entries list with status badges
- Mini trend chart (last 6 weeks total minutes)

### Athlete Log Workout

Purpose: fastest possible log flow on mobile.

Components:

- Activity type selector (icon pills)
- Date picker with week boundary info
- Minutes, distance, avg HR inputs
- Notes (optional)
- Proof image upload with preview and remove
- Submit CTA with validation summary

Behavior:

- Image is required
- No OCR check; display status as "Not checked"
- On success, return to dashboard with toast

### Athlete Weekly History

Purpose: detailed timeline and deep data access.

Components:

- Week list with summary cards
- Tap into week for detail
- Filters: activity type, min minutes, HR present

### Athlete Week Detail

Purpose: full breakdown and proof access.

Components:

- Summary metrics row
- Daily list of entries
- Each entry shows minutes, distance, HR, status
- Proof image viewer with zoom

### Weekly Leaderboard

Purpose: team motivation and visibility.

Components:

- Rank list with status color (green/red/grey)
- Total minutes, activity icons, HR indicator
- Toggle to show/hide exempt athletes

### Coach Team Overview

Purpose: manage compliance and identify gaps.

Components:

- Team summary cards (met, not met, exempt)
- Leaderboard with filters
- Missing proof and missing minutes flags

### Coach Athlete Detail

Purpose: analyze individual athlete trends.

Components:

- Weekly trend chart (minutes over time)
- Activity type distribution chart
- Entry list with proof images

### Coach Review Queue

Purpose: manage validation (placeholder for now).

Components:

- List of entries with "Not checked" status
- Ability to override status manually

## Design System

Tokens:

- Colors: primary, secondary, success, warning, danger, neutral
- Typography: large numeric stats, compact labels
- Spacing: 4/8/12/16/24/32

Core components:

- `Card`, `Badge`, `Pill`, `StatTile`
- `ProgressRing`, `MiniTrendChart`
- `ActivityIcon`, `WeekSelector`
- `TableRow`, `FilterChip`, `EmptyState`

## Data Visualization (Progress Insights)

Athlete:

- Weekly minutes trend (line chart)
- Activity type mix (stacked bar)
- HR presence indicator over time

Team:

- Distribution of weekly totals
- Compliance over time (met vs not met)
- Average minutes per activity type

## Data Fetching and Caching

- All data flows through tRPC with typed outputs
- React Query caching keyed by week and athlete
- Prefetch on route transitions for mobile speed

## Error and Empty States

- Empty history shows call-to-action to log first entry
- Upload errors show retry UI
- Locked week shows read-only badge

## Accessibility and Performance

- Touch targets minimum 44px
- High contrast badges
- Lazy-load images and proof viewer
- Skeleton loading for lists
