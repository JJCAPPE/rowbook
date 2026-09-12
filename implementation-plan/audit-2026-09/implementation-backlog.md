# Ordered release backlog

Snapshot: base SHA `ea32ffd0f61941a81e2b81718089efcd3ebfe6ca` plus the uncommitted candidate; production still served the base SHA when recorded.

The integrity/upload/review/email candidate is already implemented in the working tree. This backlog contains only work still required to turn that candidate into verified production behavior. Estimates are focused engineering effort, not promises.

| Order | Issue / owner | Files or systems | Dependency | Acceptance evidence | Effort |
| ---: | --- | --- | --- | --- | ---: |
| 0 | Close remaining source-level UI contracts, freeze candidate, and rerun the full release suite — lead/frontend | Log status, proof URL retry, history filters, settings draft guard, entire working tree and package lock | Other edits complete; decisions from I13/I18/I27/I28–I30 | Terminal extraction state can advance without blocking save; expired signed URL can renew; filter wording/scope is explicit; unsaved settings cannot disappear silently; clean unit, integration, lint, typecheck and production build; no paid calls in ordinary suite; diff reviewed for scope | 1–2 d |
| 1 | Back up and apply additive migration — backend/ops | Prisma migration, Supabase Postgres | 0; backup owner confirmed | Pre/post counts recorded; 11 migrations applied; constraints/indexes present; RLS on; public grants removed; bucket limits set; application smoke tests pass | 0.5–1 d |
| 2 | Activate and canary extraction dispatch — ops | Supabase Vault/Cron/`pg_net`, Vercel cron route | 1 and deployed route | Vault URL/token names exist without values in logs; five-minute job active; authorized canary reaches terminal state; unauthorized call is 401; oldest-ready age observable | 0.5 d |
| 3 | Reconcile legacy queue — backend/product | Legacy `ProofExtractionJob`, entries, audit | 1; cost cap decision | 843 rows classified without raw proof logging; no obsolete bulk model calls; actionable exceptions migrated/audited; rollback list retained | 0.5–1.5 d |
| 4 | Protect historical proof retention — ops/product | Storage bucket, proof records, cleanup route | Backup evidence; retention owner decision | 904 overdue records reviewed; bounded dry run/canary; deleted object and DB state agree; retries idempotent; non-image history remains | 0.5–1.5 d |
| 5 | Complete upload/save canary — QA/backend | `/athlete/log`, Storage, entry and V2 job | 1–2 | Synthetic one-photo, six-photo, HEIC, corrupt, cancel/retry, lost response and double tap pass; exactly one entry/job/audit; stored hash and attachment invariant hold | 1 d |
| 6 | Verify weekly email delivery — ops/QA | email provider, recap template, delivery ledger, Vercel weekly cron, Supabase retry cron/Vault | 1, deployed routes and authorized sender | Exactly one message to an authorized sink; HTML/text inspected; sender accepted; delivery row persisted; +5/+30 retries execute through the delivery-only route; duplicate and missed invocation tests pass; no roster send | 0.5 d |
| 7 | Authenticated interaction/device matrix — QA | I01–I33 routes/components | 5; isolated athlete/coach/admin fixtures | Real iPhone Safari camera/Photos, Android Chrome, desktop Safari/Chromium; 320–1440 px; keyboard/VoiceOver/200% zoom; errors/offline/session expiry; all inventory rows have artifacts | 2–4 d |
| 8 | Season-scale performance baseline — performance/backend | API contracts, DB, Storage, client | 1, isolated dataset | 60×32-week and 5× data; 20 cold/warm repetitions; p50/p95, requests, queries, payload/image bytes; burst and sustained load; acceptance budgets evaluated | 1–3 d |
| 9 | Held-out extraction/cost study — ML/ops | Explicit provider test, telemetry | Privacy-cleared corpus; current rates | ≥200 sets; source-separated holdout; field/decision metrics with intervals; thinking/retry costs; current vs lower-cost vs OCR-fallback decision | 1–3 d |
| 10 | Observability, restore, and runbooks — ops | Vercel/Supabase/provider/email dashboards | 1–6 | Alerts for old/stuck jobs, upload failures, spend, missed recap and cleanup; database and Storage restore rehearsed; named operator; provider-outage mode tested | 1–2 d |
| 11 | Weekly-cutoff pilot — product/ops/QA | Production cohort | All P0/P1 gates above | Small athlete/coach cohort spans a real Sunday cutoff; latency, retry, review burden, recap and cost monitored; go/no-go recorded | ≥1 week elapsed |

## Migration sequence

1. Record production SHA, migration list, table/job/proof counts, grants/RLS, bucket configuration, and backup identifiers.
2. Deploy/build a candidate compatible with both old and additive schemas where possible.
3. Apply `20260912000000_season_readiness_integrity` once through Prisma migration tooling.
4. Verify constraints, indexes, RLS/grants, bucket limits, and unchanged canonical counts before traffic tests.
5. Provision `rowbook_proof_extraction_url`, `rowbook_proof_cleanup_url`, `rowbook_weekly_url`, `rowbook_weekly_recap_delivery_url`, and `rowbook_cron_secret` in Vault; verify names only.
6. Confirm the extraction and weekly-recap five-minute Supabase Cron jobs, then run one isolated synthetic extraction.
7. Send one synthetic recap to the authorized sink and exercise one transient delivery retry without adding a second recipient row.
8. Enable a small canary cohort; do not bulk process legacy jobs or overdue proofs.

## Acceptance tests carried forward

- Save: double tap/lost response yields one canonical entry; missing/foreign/expired/reused proofs fail before commit.
- Upload: HEIC/HEIF/JPEG/PNG/WebP normalization, corrupt/oversize, failed second file, cancellation, retry, offline/reconnect, and expired authorization.
- UI recovery: post-save checking advances to a terminal state, an expired viewer URL is renewed rather than reloaded unchanged, and settings warn before discarding a dirty row.
- Worker: timeout/429/5xx, malformed output, expired lease, duplicate dispatch, crash after provider response, evidence/version change, manual-review precedence, and attempt exhaustion.
- Review: nonempty rejection reason, two coaches, worker versus coach, athlete edit versus coach, cross-team authorization, lazy expired/deleted evidence, and pagination.
- Correctness: Sunday 19:59/20:00/20:01, both DST transitions, exact minutes, 0.1 km truncation, optional HR, duplicate screenshots, exemptions/overrides, and rebuild without double counting/email.
- Operations: duplicate/missed recap, authorized sink only, bounded cleanup, database plus object restore, dispatcher outage/recovery, and alert deduplication.

## Rollback

- Stop new automatic decisions and deactivate the Supabase dispatcher; keep manual workout saving and coach review available.
- Do not drop additive tables/columns or delete accepted jobs/results. The old application must not be redeployed if it cannot read the additive schema safely.
- Preserve claim/result/delivery records, export affected IDs, and reconcile entries/aggregates with audited repairs.
- For email, deactivate weekly schedules before changing delivery state; never delete successful send records to force a resend.
- For cleanup, stop the schedule immediately and restore only from a verified object backup; database recovery alone does not restore Storage objects.
- Roll forward with a tested patch whenever possible. A production rollback is complete only when save, manual review, totals, auth, and queue age are verified.
