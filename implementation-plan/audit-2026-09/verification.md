# Independent verification

## Recommendation

**Production release completed and verified on 2026-09-12.** The frozen release is deployed, the production migration and operational reconciliation completed, and the release suites and canaries below passed. The one explicit evidence limitation is that a signed-in production GUI session could not be established because the available browsers required credentials; authenticated local browser coverage passed instead.

## Release identity

| Item | Verified value |
| --- | --- |
| Branch | `codex/season-readiness-2026-09` |
| Commits | `04c369e`, `be1fbf1`, `20d92c1`, `f6f19d5`, `3b71c7c` |
| Vercel deployment | `dpl_7XABbGqd2uc9TiBxU3Nn5gQuwgSC` |
| Production URL | [rowbook.vercel.app](https://rowbook.vercel.app) |
| Database migration | Applied transactionally and verified in production |

No credentials, secret values, signed URLs, roster rows, or proof images are recorded in these reports.

## Executed checks

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Unit behavior | 41/41 passed | Deterministic application, cutoff, DST, template, upload, and validation rules |
| Integrity/concurrency | 23/23 integration tests passed | Isolated PostgreSQL fixtures covering transactional and retry invariants |
| Type safety, lint, production build | Passed | Frozen release source graph |
| Public browser smoke | 6/6 passed | Anonymous routes, redirects, mobile overflow, and unassigned-coach recovery |
| Authenticated upload/save browser E2E | Garmin and Strava fixtures passed | Local authenticated harness; verifies workouts are saved and evidence processing completes |
| Responsive accessibility | Axe and reflow checks clean at 320, 390, and 1440 px | Public and mocked/authenticated application surfaces |
| Weekly recap timing | Exact Sunday 20:00 `America/New_York` window and spring/fall DST tests passed | Includes retry/catch-up and deterministic rendering rules |
| Weekly recap delivery | Two real Brevo messages delivered; HTML visually checked in Apple Mail | Authorized test delivery, not a roster-wide send |
| Production deployment | Live deployment identity and URL verified | Vercel deployment above |
| Production migration | Applied transactionally | Production Supabase schema |

## Production operational closeout

- Supabase Vault configuration is 5/5, six cron schedules are active, and a production extraction invocation returned HTTP 200.
- The final Vercel build came from clean commit `3b71c7c`; its 234-file build context did not contain or load a local `.env` file.
- Cleanup reconciled 904 proof rows and 867 Storage objects. Zero targeted rows or objects remained, while all 591 training entries were preserved.
- RLS is enabled on every application table, with zero table grants to `anon` or `authenticated`.
- Five coach-team memberships are active. The ten active staff without a membership receive an explicit no-team account state with retry and logout controls.
- Weekly recap delivery was exercised twice through Brevo and visually inspected in Apple Mail; exact window and DST behavior is independently test-covered.
- The post-release PostgreSQL 17 archive restored cleanly with exact production counts across users, teams, entries, proofs, aggregates, memberships, and migrations.

## Residual limitations and advisories

- A signed-in production GUI pass was not completed because the available browsers required credentials. This is not represented as production browser evidence; the authenticated local Garmin/Strava harness passed.
- Supabase reports `INFO` no-policy findings. These are expected because direct client access is intentionally deny-all; server-side authorization remains authoritative.
- Supabase leaked-password protection remains disabled. Rowbook uses Google OAuth only and does not accept Rowbook passwords.
- Supabase reports unindexed foreign keys on legacy or low-volume paths. They remain an optimization advisory, not a demonstrated release defect.
- The five-set provider benchmark and unmeasured long-run physical-device latency rows in the other workstream files remain historical snapshots; they do not claim statistically representative model accuracy or performance.

## Historical evidence boundary

The other documents in this directory preserve the 2026-09-11 pre-release audit, including its then-current counts, pending items, and bounded provider benchmark. Where those snapshots differ from this file, this 2026-09-12 closeout is the authoritative final production state.
