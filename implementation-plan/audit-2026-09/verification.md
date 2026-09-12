# Independent verification

## Recommendation

**HOLD for production at this snapshot.** The candidate has strong local integrity evidence and a passing local production build, but production still serves base SHA `ea32ffd0f61941a81e2b81718089efcd3ebfe6ca`. The additive migration, Vault dispatchers, actual email delivery, authenticated browser matrix, destructive-retention decision, deployed canary, and pilot are not yet verified.

Environment under test: macOS workspace, local PostgreSQL database `rowbook_season_test`, bounded live Gemini calls, read-only production Supabase queries, and Vercel project/deployment metadata. No raw proof images, credentials, signed URLs, or roster rows were captured.

Fixture references: `DB-FRESH-MIGRATIONS-01`, disposable integration aliases documented in the workstream reports, provider sets `C2-R-01`, `C2-B-01..03`, `GS-01`, and `EMAIL-SYNTH-A`. These references contain no production row identifiers.

## Executed checks

| Check | Sample / command | Result | Confidence and limit |
| --- | --- | --- | --- |
| Unit behavior | `npm test` | 37/37 passed | High for encoded pure/client/server rules; no browser, network, or paid provider calls |
| Integrity/concurrency | `DATABASE_URL=<isolated rowbook_season_test> npm run test:integration` | 21/21 passed | High for encoded DB invariants; local DB and small synthetic samples only |
| Type safety | `npm run typecheck` | Passed | High for current TypeScript graph |
| Static lint | `npm run lint` | Passed | High for configured lint rules |
| Migration from zero | All 11 Prisma migrations on a fresh temporary PostgreSQL DB | Passed | High for plain PostgreSQL path; hosted extension branch separately checked |
| Hosted cron SQL | Create/read schedule inside live Supabase transaction, then `ROLLBACK` | Accepted `*/5 * * * *`; no persistent change | High for SQL/function availability; not evidence of a real HTTP dispatch |
| Worker races | Concurrent job claims, expired lease recovery, stale token, worker/manual precedence | Passed in integration suite | High for tested transitions; provider ambiguity still may repeat billable work |
| Entry races | Duplicate save, altered idempotency payload, reused bytes, stale edits, simultaneous reviews | Passed in integration suite | High for tested invariants; production fault injection pending |
| Cleanup races | Bounded selection, Storage failure then retry, retention changed after selection | Passed in integration suite | High for tested local transitions; no production object was deleted and restore is pending |
| Provider parsing | Explicit `npm run test:provider` | Five evidence sets passed; one transient failure then replay | Low for population accuracy (`n=5` development sets), useful for API/configuration validation |
| Weekly cutoff/template/retry | Unit and integration tests including spring/fall DST, catch-up, escaping, empty/60-athlete output, exact persisted retry boundaries, aggregate timestamps, and injected aggregate-repair failure after delivery | Passed | High for encoded time/template and local delivery-state rules; real provider delivery pending |
| Email visual | Synthetic HTML/text at desktop/mobile viewport | No horizontal overflow observed | Moderate; limited clients, no Outlook/dark-mode/inbox delivery |
| Production build | `npm run build` | Passed; delivery-only route included | High for the current local source graph; not deployment evidence |
| Live DB audit | Aggregate metadata-only queries | Completed | High for query time; snapshot changes after migration/traffic |
| Vercel identity | Project/deployment APIs and CLI | Root, plan, runtime, region, base SHA and READY state confirmed | High; READY does not mean candidate behavior deployed |

Node’s integration runner reports the parent suite plus its subtests; the recorded 21/21 is the final aggregate from the isolated database run.

## Live snapshot reproduced

- 62 active users: 47 athletes and 15 coaches.
- 11 teams, 2 with athletes; largest current roster 45.
- 591 entries: 571 verified, 8 pending, 6 not checked, 6 rejected.
- 904 proof records: 16 unconfirmed, 181 unattached, 723 attached, none marked deleted, all 904 overdue under recorded retention timestamps.
- 878 legacy extraction jobs: 843 not checked, 20 failed, 15 completed; oldest ready row dated 2026-02-03.
- Zero duplicate proof storage paths and zero attached-but-unconfirmed proofs.
- RLS disabled on every inspected public application table. `anon` and `authenticated` each had 105 public-schema table grant rows.
- The proof bucket was private but had no explicit file-size/MIME limit and no Storage object policies.

These facts describe the existing production schema, not the candidate migration.

## Contradictions resolved

- The initial plan’s “two Hobby cron jobs” limit was stale. Current Vercel documentation allows 100 jobs, but Hobby still restricts each job to once daily with hourly precision. A frequent Vercel schedule remains invalid; Supabase Cron is the selected dispatcher.
- A READY Vercel deployment is not evidence that the candidate is live. Deployment metadata shows the base SHA, while all candidate work is uncommitted.
- A private Storage bucket alone is not sufficient authorization evidence. No live object policies were present, and server/service credentials bypass client RLS controls; application ownership checks remain required.
- Five successful extraction fixtures are API compatibility evidence, not a 95% quality demonstration.
- Synthetic email screenshots establish layout only. They do not establish sender authorization, delivery, deduplication in production, or correct recipient scope.

## Release-gate matrix

| Gate | Status | Missing evidence |
| --- | --- | --- |
| Audit | Partial | 20-run interaction baseline, complete devices, scale dataset |
| Integrity | Local pass | Production migration/canary and complete authorization/fault matrix |
| Usability | Pending | Remaining I13/I18/I27/settings source gaps; authenticated browser and real iPhone/Android evidence |
| Quality/cost | Pending | ≥200 held-out sets, thinking/retry billing, confidence intervals |
| Operational | Pending | Live dispatcher, sink email, retention canary, alerts, DB+Storage restore |
| Pilot | Pending | Small cohort across one real weekly cutoff |

## Required verification artifacts not yet available

- Production build/deploy logs for the integrated candidate.
- Authenticated traces/screenshots mapped to all I01–I33 states.
- Real iPhone camera/Photos and Android Chrome HEIC/large-image evidence.
- p50/p95 from at least 20 cold/warm repetitions and 1×/5× season load.
- Live scheduled extraction response/history and oldest-ready telemetry.
- Authorized sink email headers/provider ID plus redacted delivery-row evidence.
- Database restore and separate Storage-object restore rehearsal.
- Bounded cleanup dry run and approved legacy-job reconciliation.

Verification owner: independent release reviewer, supported by frontend/device QA and operations. Responsible scope: the complete working-tree diff, all I01–I33 surfaces, migration/cron/email configuration, and the commands listed above. Estimated focused effort is 3–7 days plus at least one elapsed weekly-cutoff pilot; dependencies are the deployed isolated environment, physical devices, approved sender/sink, privacy-cleared extraction corpus, and backup/restore access.
