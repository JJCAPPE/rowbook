# Workout save investigation, 2026-10-29

## Production evidence

Read-only investigation of [Rowbook](https://rowbook.vercel.app) on October 29, 2026. Times below include UTC and America/New_York (EDT).

- Vercel project: `prj_HKqhHnPHHfjJuF8sergOm2EFw6V5`, team `team_morXKmwvTPphzOcpdNuQmPxU`.
- Production deployment: `dpl_BoqfUriJLEV6iSEBnuSSDaLsMuo1`, created October 25 at 17:53:42.926 UTC / 13:53:42.926 EDT, region `iad1`.
- Production source: `cdd2c5ed8a137740ada0addc18867a01620bbe95`, `feat: require weekly awards after Sunday cutoff`.
- Local HEAD at investigation start: `aaa70bd1858bddee4437ce3417df44a75dd6ab4b`, `fix: refresh browser auth sessions`. This commit is an ancestor of production. The browser-auth fix is already deployed; comparing the two commit IDs alone would incorrectly suggest otherwise.
- Before this incident's changes, the deployed and local workout save form, athlete router, entries service, shared entry schema, and Supabase auth proxy had no differences.

Vercel CLI request logs, queried with a 50-minute lookback at approximately 20:35 UTC / 16:35 EDT, returned:

| Route | HTTP status | Count | Observed times on October 29 |
| --- | --- | --- | --- |
| `POST /api/trpc/athlete.createEntry` | 400 | 9 | 20:25:57.097–20:30:48.753 UTC / 16:25:57.097–16:30:48.753 EDT |
| `POST /api/trpc/athlete.createEntry` | 200 | 2 | 20:09:58.273 and 20:33:32.382 UTC / 16:09:58.273 and 16:33:32.382 EDT |
| `POST /api/trpc/athlete.createEntry` | 5xx | 0 | No matching records in this window |
| `POST /api/trpc/athlete.updateEntry` | 500 | 1 | 20:10:28.052 UTC / 16:10:28.052 EDT |

These are request counts, not unique-user counts. All records used the production deployment above. Request records contained no rejection message, response body, or duration. They establish rejected save requests, but do not identify which input was rejected or establish a database timeout.

The Vercel runtime-error cluster query with `since: "7d"` separately returned:

- `refresh_token_already_used`: 18 occurrences, 7 users, route `/middleware`; first seen October 24 at 14:31:41 UTC, last seen October 28 at 21:08:03 UTC.
- `refresh_token_not_found`: 4 occurrences, 2 users, route `/middleware`; cluster first-seen September 30 at 17:33:50 UTC and last-seen October 24 at 17:28:04 UTC. The first-seen field extends beyond the requested window, so it is not evidence that every listed occurrence happened during that window.

These auth clusters are separate observations; no trace connects them to the 400 save requests.

## Reproduction and source findings

The real `LogWorkoutForm` accepted `minutes = 42.5`, while the server's shared `MinutesSchema` required a positive integer. The athlete router applies `TrainingEntryInputSchema` before entering the save service, so this mismatch produces HTTP 400. The existing client catch handler replaced the rejection with the screenshot's generic unconfirmed-save message and retained the failed immutable submission intent. Changing minutes to `42` then could not retry that submission.

The client investigator reproduced this against the actual local Next.js app on port 3100, with a valid ready-proof draft and browser interception of the tRPC response. The intercepted HTTP 400 mirrored the server's Zod integer-validation error. This exercised the real form and recovery behavior, but did not write a workout to a database or demonstrate that the production users entered decimal minutes.

Initial reproduction command:

```sh
uv run --with playwright python /tmp/rowbook-save-repro.py
```

Observed output:

```text
REPRODUCED: minutes=42.5 sends invalid createEntry; HTTP400 shows screenshot error; corrected minutes=42 cannot retry. API call count=1.
```

The temporary reproduction is an investigation artifact, not a claim about all causes of failed saves. Permanent coverage is in `tests/e2e/workout_save.py` and `tests/unit/entry-save-errors.test.ts`.

## Completed patch and verification

- Align whole-minute and optional-heart-rate validation with the API. Explain dates outside the seven-day entry window before submission, while allowing acknowledged-save recovery for older pending submissions.
- Restore existing invalid pending drafts without changing their submission ID or discarding their uploaded-photo references.
- Return explicit `BAD_REQUEST` for rejected workout/proof details and `CONFLICT` for a reused submission ID with different values. Database failures remain distinguishable from safe rejections.
- Retry uncertain saves at most three times with a 20-second deadline per attempt and the identical input/submission ID. Preserve unresolved drafts, display session-expiry instructions, and prevent late responses or unmounted forms from clearing a newer draft.
- Record failed API operation, error category, elapsed time, and validation field paths/codes without logging workout values, credentials, or raw database messages.

Verification passed:

- `npm run test:unit`: 126 tests, including 16 save rejection/acknowledgement tests.
- Local `tests/integration/entry-integrity.test.ts`: 27 tests against the isolated `rowbook_season_test` PostgreSQL database, including simultaneous duplicate submissions, proof reuse, transactions, and authorization.
- `E2E_BROWSER_CHANNEL=chrome uv run --with playwright python tests/e2e/workout_save.py`: 13 browser scenarios, including a phone viewport, actual intercepted HTTP 400/401 responses, legacy stuck drafts, lost/hung responses, retry limits, navigation, and late-response protection. Browser application APIs were intercepted; these were not production writes.
- TypeScript, ESLint, and whitespace checks passed. The final production build passed in `/private/tmp/rowbook-workout-save-release-20261029`, based on the deployed `cdd2c5e` plus only the three save-flow source files and two regression-test files. The build reused installed dependencies and local placeholder environment values; it did not connect to production services.
- An unauthenticated request to the real local save route returned HTTP 401.

No schema, dependency, deployment-region, pool-size, or production-data changes are needed for this patch. Production publishing remains pending explicit approval.

## Access and evidence limits

- Vercel rejected a seven-day runtime-log request because the Hobby plan retains one hour of runtime detail. A 50-minute connector runtime-log query returned no application-output logs; the CLI request-log endpoint supplied the HTTP-status evidence above.
- Rowbook's configured Supabase project is `vobbcgadkxfrzxmzrdch`. The connected Supabase account listed a different inactive project. A direct `get_project` call for Rowbook returned `You do not have permission to perform this action`. No alternate credentials were used to bypass that denial. Production database logs, advisory checks, migration state, and connection saturation were not inspected.
- The screenshot's exact request cannot be identified from the supplied image and retained logs. No response payload, workout fields, proof image, email address, or credential is stored in this report.
- This investigation did not change production data or deploy code.

## Read-only commands and connector calls

```sh
vercel logs --scope team_morXKmwvTPphzOcpdNuQmPxU --project prj_HKqhHnPHHfjJuF8sergOm2EFw6V5 --environment production --since 50m --no-branch --query 'athlete.createEntry' --limit 100 --json
vercel logs --scope team_morXKmwvTPphzOcpdNuQmPxU --project prj_HKqhHnPHHfjJuF8sergOm2EFw6V5 --environment production --since 50m --no-branch --status-code 4xx --limit 100 --json
vercel logs --scope team_morXKmwvTPphzOcpdNuQmPxU --project prj_HKqhHnPHHfjJuF8sergOm2EFw6V5 --environment production --since 50m --no-branch --status-code 5xx --limit 100 --json
git merge-base --is-ancestor aaa70bd cdd2c5ed8a137740ada0addc18867a01620bbe95
git diff cdd2c5ed8a137740ada0addc18867a01620bbe95..aaa70bd -- apps/web/src/components/forms/log-workout-form.tsx apps/web/src/server/routers/athlete.ts apps/web/src/server/services/entries-service.ts packages/shared/src/schemas/entry.ts apps/web/src/lib/supabase/proxy.ts
```

Connector reads: Vercel `get_project`, `get_deployment` with `withGitRepoInfo: "true"`, `get_runtime_errors` with `since: "7d"`, and `get_runtime_logs`; Supabase `list_projects` and `get_project` for Rowbook. Vercel `get_observability_schema` returned 404, so it supplied no latency evidence.

## Patch-only release source

The current workspace is dirty and its local `main` points to an older ancestor of production. Publishing that directory or rebuilding local HEAD could omit existing production changes or include unrelated unfinished work.

Use a new isolated worktree based on the verified production commit `cdd2c5ed8a137740ada0addc18867a01620bbe95`, then apply only the explicit workout-save patch and its regression tests. Review the resulting diff against that production commit and run validation in the isolated tree. Preserve the baseline lockfile and `.vercelignore`; do not copy local environment files or unrelated workspace files. Recheck the live production commit before release in case another deployment has occurred.

The repository already has a clean worktree at `/private/tmp/rowbook-weekly-reveal-release` on the production commit; the patch uses a separate worktree to preserve it. Production is connected to GitHub `JJCAPPE/rowbook`, branch `main`. The save-only patch is prepared separately for review and release. No push or deployment has been performed.

The historical [release verification](audit-2026-09/verification.md) records the existing clean-source deployment practice and excludes local `.env` files. The older [infra plan](infra/README.md) is a design plan, not evidence of current deployment configuration; the inspected deployed commit and checked-in configuration are the release baseline.
