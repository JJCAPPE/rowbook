# Supabase and backend audit

Base SHA: `ea32ffd0f61941a81e2b81718089efcd3ebfe6ca`; candidate was uncommitted. Live work was read-only except a scheduler definition created inside a transaction and rolled back. No row-level roster data, credentials, URLs with credentials, signed object URLs, or proof contents were captured.

Audit references: `LIVE-AGG-2026-09-11` is the aggregate-only production snapshot below; `DB-FRESH-MIGRATIONS-01` is the disposable local database that received all 11 migrations. These are report labels, not production row IDs.

## Project/deployment mapping

| Layer | Verified mapping |
| --- | --- |
| Vercel | Project `rowbook`, root `apps/web`, Hobby, Node 24, region `iad1`; production READY on the base SHA |
| Supabase URL/direct DB | Project ref `vobbcgadkxfrzxmzrdch` matched server, Storage and browser configuration hosts |
| PostgreSQL pooler | Host indicates `us-west-2`; Vercel-to-database RTT is not measured |
| Application DB role | `postgres`, non-superuser, `BYPASSRLS`; application authorization cannot rely on RLS alone |
| Migrations | Ten historical Prisma migrations live; restored connected-activity migration matches history; season-readiness migration pending |

## Live aggregate snapshot

Read 2026-09-11 with bounded aggregate queries.

| Entity/state | Count |
| --- | ---: |
| Users | 62 active: 47 athlete, 15 coach |
| Teams | 11 total; 2 nonempty; largest roster 45 |
| Training entries | 591 |
| Entry decisions | 571 verified; 8 pending; 6 not checked; 6 rejected |
| Proof records | 904 |
| Proof integrity | 723 attached; 181 unattached; 16 unconfirmed; 0 attached-unconfirmed; 0 duplicate storage paths |
| Retention | 904 overdue; 0 already marked deleted |
| Weekly aggregates | 668 |
| Legacy extraction jobs | 878: 843 not checked; 20 failed; 15 completed |
| Oldest legacy ready job | 2026-02-03T15:05:56.958Z |

The new `EvidenceExtractionJob` table does not exist in production until migration. The candidate worker does not blindly consume the 843 legacy ready rows.

## Security/storage snapshot

- RLS was disabled on every inspected public application table, including `_prisma_migrations`.
- `anon` and `authenticated` each had 105 public-schema table grant rows.
- The proof bucket was private, but `file_size_limit` and `allowed_mime_types` were null and no `storage.objects` policies were present.
- The server uses bypass/service credentials, so router/service ownership and team-membership checks remain part of the security boundary.

The pending migration enables RLS for application tables, revokes existing and default table/sequence/function privileges from public API roles, adds explicit proof bucket limits, and adds coach-team membership. These changes passed a fresh local migration but are not live controls.

## Candidate data contract

- Unique athlete/submission and evidence keys prevent duplicate saves/jobs.
- Proof storage paths are unique; proof attachments have explicit `attachedAt`, verified size/MIME/hash, and client submission.
- Entry `version` and reviewer timestamps protect edit/review/worker races.
- Evidence jobs store attempt/lease/token, immutable manifest/revision/reference date, sanitized failure/result metadata and provider/version fields.
- Weekly recap deliveries are unique per team/week/recipient and use status, retry and lease columns.
- Coach reads/mutations and reports resolve explicit membership; report inputs are bounded and CSV cells are quoted/formula-protected.
- Weekly athlete aggregates serialize per athlete/week with a transaction advisory lock and re-read canonical entries before upsert.

## Query/index assessment

Candidate indexes directly support proof attachment/client submission/content lookup, entry week/review ordering, coach membership, weekly delivery retry/lease lookup, and evidence job readiness/lease/priority ordering. The exact claim path was concurrency-tested.

Representative production `EXPLAIN (ANALYZE, BUFFERS)` was **not run** for the additive tables because they are not deployed, and a 32-week/5× representative dataset does not exist. Page request query counts, payload bytes, connection saturation, and Vercel-to-DB RTT remain pending. Do not label the candidate indexes optimal until those measurements exist.

## Migration and operational risks

1. RLS/grant hardening can reveal an undocumented direct browser dependency. Verify anon requests are denied while all supported server flows work.
2. The coach-membership backfill is fail-closed: only historical staff actions create a team grant. Active staff without attributable actions remain unassigned until an operator records an explicit product-owner decision; use `coach-membership-backfill.md` for the review/grant procedure.
3. All proof rows are overdue. Enabling cleanup without backup/approval would cause a material deletion wave.
4. The legacy queue is large and stale. Migrating it without canonical-status reconciliation could create unnecessary paid calls.
5. `iad1` to `us-west-2` is an observed region mismatch; impact is unknown until runtime measurements.

## Required post-migration checks

- Compare row counts/invariants and migration ledger before/after.
- Assert new constraints/indexes/tables and storage bucket limits.
- Connect as `anon` and `authenticated` and verify public table access is revoked; verify server role still works.
- Exercise athlete ownership, coach membership, cross-team denial, signed proof access, reporting and settings.
- Provision Vault dispatcher values without logging them; confirm cron history and endpoint 200/401 behavior.
- Run representative query plans and 1×/5× connection/load tests.
- Verify database backup and separate Storage-object restore.

Responsible files: Prisma schema and season-readiness migration; auth/Supabase clients; proof, entry, coach, reporting, requirement, validation and weekly services/repositories.

| Proposed action / owner | Dependency | Evidence required | Effort |
| --- | --- | --- | ---: |
| Back up and apply the additive migration — backend/ops | Candidate freeze and restore owner | Pre/post counts, 11 migrations, constraints/indexes, RLS/grants and bucket limits | 0.5–1 d |
| Cross-role authorization canary — backend/security | Migration plus isolated users in two teams | Anon/authenticated SQL denied; supported server paths succeed; cross-team reads/mutations fail | 0.5–1 d |
| 1×/5× plans and request instrumentation — performance/backend | Disposable 32-week dataset | Query count/time, `EXPLAIN (ANALYZE, BUFFERS)`, payload, connections and RTT | 1–3 d |
| Region decision — ops | Measured Vercel-to-DB latency | Keep or move based on recorded end-to-end effect and cost | 0.5 d after measurements |
