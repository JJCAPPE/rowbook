# Rowbook season-readiness audit — 2026-09

Status at this snapshot: **hold production release pending the gates below**.

This directory records the implemented candidate and evidence available on 2026-09-11. It is intentionally stricter than a changelog: a source inspection is not a browser pass, a local test is not a production check, and an undeployed migration is not a live control.

## Snapshot identity

| Item | Verified value |
| --- | --- |
| Repository base SHA | `ea32ffd0f61941a81e2b81718089efcd3ebfe6ca` on `main` |
| Candidate identity | The SHA above plus an uncommitted working tree; no candidate commit SHA existed when this audit was written |
| Production deployment | READY and serving the base SHA above; the candidate was not deployed |
| Vercel project | `rowbook`; root `apps/web`; Hobby plan; Node 24; function region `iad1` |
| Supabase project | `vobbcgadkxfrzxmzrdch`; Postgres pooler indicates `us-west-2` |
| Production migration state | Ten historical Prisma migrations applied; the additive season-readiness migration is pending |
| Evidence policy | Aggregate/synthetic data only; no credentials, signed URLs, roster rows, or proof images are included |

## Decisions embodied by the candidate

- Workout saving is independent of AI completion. A unique athlete/submission key makes lost-response retries idempotent.
- Proof confirmation verifies stored bytes, type, size, hash, ownership, expiry, and attachment state before a workout can consume them.
- One evidence-set revision produces one canonical extraction. Duplicate screenshots are never added together.
- Extraction uses the maintained `@google/genai` SDK, `gemini-3.8-flash`, strict runtime validation, a 60-second provider timeout, three total attempts, leases, and claim-token compare-and-set writes.
- The Vercel account cannot run sub-daily cron. The candidate therefore schedules a five-minute Supabase Cron dispatcher backed by the durable Postgres job table.
- Coach decisions require team membership, an expected entry version, and an atomic entry/proof/audit write. A stale worker cannot overwrite a manual decision.
- Weekly recap delivery is persisted per recipient/team/week, individually addressed, retry bounded, and gated by the Sunday 20:00 America/New_York cutoff with a 48-hour catch-up window. Cutoff-critical enqueue/delivery runs before best-effort aggregate repair, and a delivery-only Supabase dispatcher checks due retries every five minutes without rebuilding aggregates or creating recipients.

See [decisions.md](decisions.md) for the complete rule table.

## Most important causes and candidate corrections

1. The previous upload UI serialized slow work and displayed simulated progress. The candidate creates previews immediately, normalizes HEIC/HEIF/JPEG/PNG/WebP to bounded JPEG, uploads two files concurrently with real XHR bytes, and exposes per-file cancellation/retry.
2. The previous server trusted client completion/OCR and split related writes. The candidate verifies Storage and commits entry, attachments, durable job, and audit atomically.
3. The legacy extraction queue had no durable retry/lease recovery and no deployed consumer. The candidate has an evidence-set queue with leases, backoff, stale-claim recovery, and a five-minute dispatcher.
4. Review loaded too much evidence and allowed weak mutation contracts. The candidate server-filters and paginates metadata, signs evidence lazily, requires rejection reasons, and uses optimistic-concurrency guards.
5. Weekly email lacked send-once state and robust catch-up. The candidate adds a delivery ledger, leases, persisted five- and thirty-minute retry timing, a delivery-only recovery dispatcher, recap-before-repair execution, DST-tested gating, HTML/text templates, and synthetic desktop/mobile rendering.

## Verified evidence ledger

| ID | Evidence | Result |
| --- | --- | --- |
| V01 | `npm test` after the data-integrity fixes | 37 unit tests passed; no paid provider calls are part of this command |
| V02 | `npm run test:integration` against isolated `rowbook_season_test` | 21 tests passed; includes duplicate save, attachment replay, stale edit/review, worker/manual precedence, lease recovery, canonical leaderboard reads, bounded retry-safe cleanup, clocked recap retries, and recap delivery despite aggregate-repair failure |
| V03 | `npm run typecheck` | Passed |
| V04 | `npm run lint` | Passed |
| V05 | All 11 migrations deployed to a fresh local PostgreSQL database | Passed; hosted-extension scheduling branch is skipped when extensions are unavailable |
| V06 | Supabase scheduler SQL exercised inside `BEGIN`/`ROLLBACK` | `pg_cron` accepted the five-minute job; no persistent job or HTTP request was created |
| V07 | Read-only live database audit | Aggregate counts, migration history, grants, RLS flags, bucket metadata, and backlog recorded in [backend.md](backend.md) |
| V08 | Explicit capped provider benchmark | Five evidence sets passed their assertions; six calls occurred because one attempt failed transiently and was replayed |
| V09 | Synthetic weekly recap HTML/text and two viewport renders | Template/DST tests passed; no horizontal overflow observed; no real email was sent |
| V10 | Vercel project/deployment inspection | Project root, plan, runtime region, base SHA, and READY state confirmed |
| V11 | `npm run build` for the integrated local candidate | Passed; the delivery-only cron route appears in the production route manifest |
| V12 | Static cron-budget and schedule check | Both Vercel configs retain two jobs; Supabase migration contains the two DST-covering five-minute recap-retry schedules |

## Open blockers

- Apply and verify the additive production migration; then provision the required Vault endpoint URLs and shared bearer secret and confirm real scheduled runs.
- Production currently has RLS disabled on all inspected public application tables and 105 grant rows each for `anon` and `authenticated`. The pending migration revokes those grants and enables RLS; this is not yet production protection.
- The private proof bucket currently has no explicit size/MIME limit and no Storage policies. Candidate limits are pending migration verification.
- Decide how to preserve or reconcile 843 legacy ready jobs. Do not automatically spend against or mutate this historical backlog.
- All 904 stored proof records are past their recorded deletion time. Back up/confirm the retention decision before enabling destructive cleanup.
- Send exactly one recap to an authorized test sink and verify provider acceptance, sender authorization, text/HTML rendering, and persisted delivery state. No roster send has been authorized or performed.
- Complete authenticated browser testing, a real iPhone Photos/camera pass, Android Chrome, desktop Safari, 320–1440 px accessibility coverage, offline/reconnect, and a 32-week 1×/5× load run.
- Close the remaining source-level UI gaps documented in `interactions.md`: advance the post-save checking message to a terminal state, renew expired signed proof URLs, make history-filter scope explicit, and guard unsaved settings rows.
- Rerun the production build after the working tree is frozen, deploy a canary, verify runtime logs, and exercise rollback. The current integrated local build passes.
- Establish database and Storage backup/restore evidence, alerting, operational ownership, and a real weekly-cutoff pilot.

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
