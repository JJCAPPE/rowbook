# Infra and Deployment Plan

This document covers Supabase, Vercel, storage, cron, and environment setup.

## Supabase

- Create a Supabase project
- Enable Postgres and create a private Storage bucket:
  - `proof-images`
- Use Prisma migrations for all schema changes
- Store user whitelist and roster in DB tables
- Use service role key for server-side Prisma access

## Vercel

- Deploy the Next.js app to Vercel
- Configure environment variables from `.env.example`
- Use Vercel Cron for scheduled jobs:
  - Weekly aggregation and email at Sunday 6:00 PM America/New_York
  - Daily proof cleanup

## Cron Schedule

- `0 18 * * 0` (Sunday 6:00 PM ET)
- `0 3 * * *` (Daily cleanup, 3:00 AM ET)

These times should be configured in Vercel with timezone handling or
computed in the job handler using America/New_York.

## Storage and Proof Image Retention

- Uploads go directly to Supabase Storage via signed URL
- `deleteAfter` timestamp stored in `ProofImage`
- Cleanup job removes old files and logs deletions

## Environment Variables

Use `.env.example` as the template. Never commit real secrets.

## Email Provider

- Use Resend or Postmark
- Send weekly recap emails via Cron
- Store provider response IDs for delivery audit

## Monitoring and Logs

- Add Sentry for error tracking
- Log job execution and failure counts
