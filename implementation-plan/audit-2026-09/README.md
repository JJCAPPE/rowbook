# Rowbook season-readiness audit — 2026-09

Final status (2026-09-12): **released to production and verified against the closeout evidence below**.

This directory retains the 2026-09-11 pre-release workstream snapshots and the 2026-09-12 production closeout. Historical benchmarks remain snapshot-oriented; [verification.md](verification.md) is the authoritative final release record.

## Release identity

| Item | Verified value |
| --- | --- |
| Release branch | `codex/season-readiness-2026-09` |
| Release commits | `04c369e`, `be1fbf1`, `20d92c1`, `f6f19d5`, `3b71c7c` |
| Production deployment | `dpl_7XABbGqd2uc9TiBxU3Nn5gQuwgSC`, live at [rowbook.vercel.app](https://rowbook.vercel.app) |
| Vercel project | `rowbook`; root `apps/web`; Hobby plan; Node 24; function region `iad1` |
| Supabase project | `vobbcgadkxfrzxmzrdch`; Postgres pooler indicates `us-west-2` |
| Production migration state | Season-readiness migration applied transactionally and verified |
| Evidence policy | Aggregate/synthetic data only; no credentials, signed URLs, roster rows, or proof images are included |

## Decisions embodied by the release

- Workout saving is independent of AI completion. A unique athlete/submission key makes lost-response retries idempotent.
- Proof confirmation verifies stored bytes, type, size, hash, ownership, expiry, and attachment state before a workout can consume them.
- One evidence-set revision produces one canonical extraction. Duplicate screenshots are never added together.
- Extraction uses the maintained `@google/genai` SDK, `gemini-3.8-flash`, strict runtime validation, a 60-second provider timeout, three total attempts, leases, and claim-token compare-and-set writes.
- The Vercel account cannot run sub-daily cron. The candidate therefore schedules a five-minute Supabase Cron dispatcher backed by the durable Postgres job table.
- Coach decisions require team membership, an expected entry version, and an atomic entry/proof/audit write. A stale worker cannot overwrite a manual decision.
- Weekly recap delivery is persisted per recipient/team/week, individually addressed, retry bounded, and gated by the Sunday 20:00 America/New_York cutoff with a 48-hour catch-up window. Cutoff-critical enqueue/delivery runs before best-effort aggregate repair, and a delivery-only Supabase dispatcher checks due retries every five minutes without rebuilding aggregates or creating recipients.

See [decisions.md](decisions.md) for the complete rule table.

## Most important causes and release corrections

1. The previous upload UI serialized slow work and displayed simulated progress. The candidate creates previews immediately, normalizes HEIC/HEIF/JPEG/PNG/WebP to bounded JPEG, uploads two files concurrently with real XHR bytes, and exposes per-file cancellation/retry.
2. The previous server trusted client completion/OCR and split related writes. The candidate verifies Storage and commits entry, attachments, durable job, and audit atomically.
3. The legacy extraction queue had no durable retry/lease recovery and no deployed consumer. The candidate has an evidence-set queue with leases, backoff, stale-claim recovery, and a five-minute dispatcher.
4. Review loaded too much evidence and allowed weak mutation contracts. The candidate server-filters and paginates metadata, signs evidence lazily, requires rejection reasons, and uses optimistic-concurrency guards.
5. Weekly email lacked send-once state and robust catch-up. The candidate adds a delivery ledger, leases, persisted five- and thirty-minute retry timing, a delivery-only recovery dispatcher, recap-before-repair execution, DST-tested gating, HTML/text templates, and synthetic desktop/mobile rendering.

## Verified evidence ledger

| ID | Evidence | Result |
| --- | --- | --- |
| V01 | `npm test` after the final fixes | 41/41 unit tests passed; no paid provider calls are part of this command |
| V02 | `npm run test:integration` against isolated `rowbook_season_test` | 23/23 integration tests passed, including integrity, concurrency, retry, cleanup, and recap invariants |
| V03 | `npm run typecheck` | Passed |
| V04 | `npm run lint` | Passed |
| V05 | Fresh-database migration test and production migration | Passed; production migration applied transactionally |
| V06 | Supabase Vault, Cron, and worker canary | Vault configuration 5/5; six schedules active; extraction invocation returned HTTP 200 |
| V07 | Final production database audit | RLS enabled on all application tables; zero `anon`/`authenticated` grants |
| V08 | Explicit capped provider benchmark | Five evidence sets passed their assertions; six calls occurred because one attempt failed transiently and was replayed |
| V09 | Weekly recap delivery and rendering | Two real Brevo deliveries succeeded; HTML was visually checked in Apple Mail; exact window and DST tests passed |
| V10 | Vercel production inspection | Clean-tree deployment `dpl_7XABbGqd2uc9TiBxU3Nn5gQuwgSC` is live at `rowbook.vercel.app`; the build context contained no local `.env` file |
| V11 | `npm run build` for the frozen release | Passed alongside final typecheck and lint |
| V12 | Browser verification | Six public smoke tests plus authenticated Garmin/Strava E2E passed; Axe/reflow checks were clean at 320, 390, and 1440 px |
| V13 | Retention reconciliation | 904 proof rows and 867 Storage objects reconciled; zero remained; all 591 entries were preserved |
| V14 | Coach access reconciliation | Five memberships active; ten active unassigned staff receive the explicit account state instead of a dead end |

## Final production closeout and bounded limitations

- Production signed-in GUI inspection could not be completed because the available browsers required credentials. The authenticated local browser harness, including Garmin and Strava fixtures, passed; this limitation is recorded rather than represented as production GUI evidence.
- Remaining Supabase advisories are understood: `INFO` no-policy findings are expected for deny-all/direct-client access, leaked-password protection is disabled because authentication is Google OAuth-only, and the unindexed foreign keys are legacy or low-volume paths.
- The small provider benchmark and unmeasured long-run/device latency rows remain historical evidence, not claims of population-level model accuracy or a broad physical-device performance study.

## Directory map

- [interactions.md](interactions.md) — I01–I33 test inventory and evidence state
- [upload-extraction.md](upload-extraction.md) — upload/save/job contract and failure evidence
- [backend.md](backend.md) — project mapping, live aggregate snapshot, schema/security findings
- [review-correctness.md](review-correctness.md) — review rules, concurrency, and totals contract
- [operations-cost.md](operations-cost.md) — dispatch, recap, retention, cost model, and runbook gaps
- [baseline.csv](baseline.csv) — measured rows and explicit unmeasured rows
- [extraction-benchmark.md](extraction-benchmark.md) — capped six-call experiment
- [implementation-backlog.md](implementation-backlog.md) — remaining release work, acceptance, migration, rollback
- [decisions.md](decisions.md) — product and architecture decisions
- [verification.md](verification.md) — release-gate evidence and recommendation
