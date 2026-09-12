# Operations and cost

Base SHA: `ea32ffd0f61941a81e2b81718089efcd3ebfe6ca`; candidate was uncommitted. Environment evidence: Vercel APIs/CLI, Supabase metadata-only queries, live extension inspection, rolled-back scheduler validation, local email render/tests, and a capped Gemini benchmark.

Fixture references: `EMAIL-SYNTH-A` is the invented recap rendered locally; provider evidence uses `C2-R-01`, `C2-B-01..03`, and `GS-01`. No real recipient or proof content appears in this report.

## Runtime and dispatch

| Item | Verified state |
| --- | --- |
| Vercel | Hobby plan, project root `apps/web`, Node 24, function region `iad1` |
| Database | Supabase ref `vobbcgadkxfrzxmzrdch`; pooler indicates `us-west-2` |
| Vercel cron limit | 100 configured jobs, but Hobby jobs run at most daily with hourly precision |
| Candidate proof worker | Node route, 300-second max duration, four workers, 100-job cap, 210-second claim window |
| Recovery dispatcher | Supabase `pg_cron` + `pg_net`, every five minutes, 295-second HTTP timeout |
| Weekly retry dispatcher | Delivery-only Node route; every five minutes on Monday/Tuesday UTC plus Wednesday hour 00 UTC, with an exact New York window gate |
| Credentials | Endpoint and bearer token read from Vault names; no values in migration/source/logs |
| Durability | Postgres evidence job is authoritative; immediate `waitUntil` and `pg_net` are notifications/reconcilers |

Production had `pg_cron 1.6.4`, `pg_net 0.19.5`, and `supabase_vault 0.3.1`. The extraction schedule SQL was accepted inside a live transaction and rolled back; all 11 migrations, including the recap schedules, also applied cleanly to a fresh local database. The migration will create/upsert the named schedules, but dispatch remains inactive until the migration is applied and the corresponding Vault endpoint URLs and shared bearer secret are provisioned.

Overlap is safe at the state layer: ready rows use `SKIP LOCKED`; claimed rows carry a lease/token; final writes compare the token and current evidence/review version. A process crash after provider success can still cause a repeated billable request after lease expiry. Telemetry must measure this rather than claiming exactly-once provider billing.

## Weekly recap

Candidate behavior:

- enqueue only active, nonempty, enabled teams;
- recipients are active athletes plus explicit active coach/admin memberships;
- one recipient per `To` message;
- unique delivery key per recipient/team/week, lease/compare-and-set claim, maximum three attempts, four-message concurrency and 15-second provider timeout;
- Sunday 20:00 New York boundary with a <48-hour catch-up window;
- Vercel invokes the gated weekly endpoint at 00:00 and 01:00 UTC daily to cover EDT/EST; duplicate calls are harmless;
- Supabase invokes a delivery-only endpoint every five minutes on Monday/Tuesday UTC and during Wednesday hour 00 UTC; its exact DST-aware gate handles the EST boundary and it neither enqueues recipients nor rebuilds aggregates;
- the weekly route completes cutoff-critical enqueue/delivery before starting best-effort aggregate repair, so a slow or failed six-week repair cannot suppress the recap; repair failure remains visible as a non-successful cron result;
- aggregate repair never sends email;
- HTML and text alternatives with escaped values and valid HTTPS CTA.

Local unit tests cover both DST changes, exact cutoff, catch-up expiry, escaping, empty state and a 60-athlete template. Database-backed tests prove five-minute then thirty-minute retry eligibility, no early claim, stable idempotency keys, deterministic sent time, exact 48-hour closure, no delivery-only aggregate mutation, and successful persisted delivery before an injected repair failure. Synthetic desktop/mobile renders showed no horizontal overflow. Outlook behavior, dark-mode inversion, sender-domain authorization, inbox/spam placement, provider ID, live delivery ledger and actual schedule are pending. No real email or roster send occurred in this audit.

## Retention and cleanup

New proof retention is credited-week cutoff plus seven New York calendar days. Cleanup rejects deleted/unuploaded objects in view paths, takes at most 500 ordered candidates per run, locks and rechecks each row before object removal, records deletion in the same per-proof transaction, and continues with an explicit failure count. Local integration tests cover a Storage failure/retry and a candidate whose retention changes after selection. However, the live read-only snapshot found all 904 proof rows overdue and none marked deleted. Enabling cleanup now could delete all corresponding stored evidence; treat this as a material operation requiring separate Storage backup, product approval and a bounded canary.

Legacy extraction also needs a deliberate plan: 843 ready legacy jobs are months old. Do not automatically send them to the paid provider. Reconcile against current entry decisions and migrate only actionable exceptions under a cost cap.

## Cost model

Observed successful Gemini token subtotal (`n=5`) was $0.008451, or $0.0016902 per successful fixture, at the introductory September 2026 token rates. This excludes a failed call and thinking tokens and therefore is not a bill.

```text
AI total = input + image + candidate output + thinking + failed attempts + fallback
Cost per successful workout = all processing charges / terminal successful workouts
Monthly total = AI + Vercel functions + Supabase plan/compute + Storage/egress
                + dispatch + observability + email
Season total = fixed monthly infrastructure across the season + variable usage
```

| Scenario | Workouts | Proposed AI ceiling | Incomplete observed-token projection |
| --- | ---: | ---: | ---: |
| 1× season | 11,520 | $115.20 | $19.47 |
| 5× season | 57,600 | $576.00 | $97.36 |

The last column is only a lower-bound sensitivity calculation. Actual Vercel/Supabase/email plans, current bills, Storage bytes/egress, thinking tokens, failed calls, abandoned uploads, cleanup lag and observability costs were not obtained. A monthly cap response must disable/delay automatic decisions while preserving save/manual review.

## Minimum telemetry and alerts

Record submission/job/entry correlation IDs, stage durations, uploaded bytes, status/retry/lease age, sanitized failure code, model/prompt/schema versions, all billable token classes, and provider request ID where safe. Do not record proof content, extracted personal fields, signed URLs, credentials, or email addresses.

Alert with deduplication on oldest ready/stuck job, terminal-failure rate, upload confirmation failure, provider 429/5xx/timeout, monthly spend, missed recap window, unknown email delivery, and cleanup overdue count. Each alert needs an owner and recovery command. None of these live alerts was verified.

## Rollout/runbook

1. Back up database and Storage separately; capture pre-migration counts.
2. Deploy/apply additive schema and verify access/invariants.
3. Provision Vault secrets and run one synthetic extraction canary.
4. Send one recap to an authorized sink; never the roster during audit.
5. Keep legacy processing and cleanup disabled until separately approved.
6. Pilot a small cohort across a real cutoff; observe queue age, review load and actual charges.
7. On regression, deactivate dispatch/automatic decisions, retain jobs/results/deliveries, and keep save/manual review online.

Responsible systems/files: `apps/web/vercel.json`, cron routes, evidence and weekly jobs/repositories, email service/template, season-readiness migration, Supabase Vault/Cron/Storage, Vercel runtime/logs, and provider billing dashboards.

| Remaining operation / owner | Dependency | Effort |
| --- | --- | ---: |
| Dispatcher and extraction canary — ops/backend | Migration, Vault provisioning, deployed route | 0.5 d |
| One authorized sink recap — ops/QA | Sender-domain approval and isolated delivery row | 0.5 d |
| Retention backup/dry run/canary — ops/product | Explicit historical-retention decision and Storage restore proof | 0.5–1.5 d |
| Alerts and DB/Storage restore rehearsal — ops | Named operator and monitoring access | 1–2 d |
| Weekly-cutoff pilot — product/ops | All release gates | At least one week elapsed |
