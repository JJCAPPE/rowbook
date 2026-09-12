# Product and architecture decisions

Final production state (2026-09-12): branch `codex/season-readiness-2026-09`, application commits `04c369e`, `be1fbf1`, and `20d92c1`, audit commit `f6f19d5`, and clean-deployment guard `3b71c7c`, deployed as `dpl_7XABbGqd2uc9TiBxU3Nn5gQuwgSC` at [rowbook.vercel.app](https://rowbook.vercel.app).

| Decision | Production rule | Example / impact | State |
| --- | --- | --- | --- |
| Credited week | Credit by server-observed submission time using the Sunday 20:00 `America/New_York` boundary. Workout date is a separate calendar value and may be up to seven days old, not future. | A Sunday workout saved at 20:01 belongs to the new credited week even if its workout date is Sunday. An idempotent retry retains the originally stored week. | Deployed; exact window and spring/fall DST tests passed |
| Duration | Provider seconds are rounded once to integer minutes; entered minutes must equal canonical evidence minutes. No one-sided “at least” tolerance. | 1,269.9 seconds becomes 1,270 seconds and 21 minutes. Entering 20 or 22 needs review. | Deployed and unit-tested |
| Distance | Required for every activity except `OTHER`; compare at 0.1 km truncation precision after unit normalization. | 6.09 km entered and 6.01 km extracted both compare as 6.0 km. | Deployed and unit-tested |
| Heart rate | Optional. Missing HR cannot fail an otherwise valid workout; if both entry and evidence include HR, a mismatch needs review. | Entered 150 with no readable photo HR remains eligible; conflicting recorded values do not auto-approve. | Deployed and unit-tested |
| Multi-photo evidence | One submission may contain 1–6 immutable proofs. Extract the complete set once; never sum per-image totals. Reject repeated IDs, repeated content, and previously attached content. | Garmin and Strava screenshots of one session resolve to 92 minutes, not 184. | Deployed; authenticated Garmin/Strava browser E2E passed |
| Incomplete/provider failure | Saving succeeds independently. `PENDING` means checking/review; terminal unreadable/exhausted work becomes `EXTRACTION_INCOMPLETE`, never an automatic rejection. | A provider outage preserves the workout and routes it to explicit manual review after bounded retries. | Deployed; failure and retry transitions integration-tested |
| Post-review editing | Notes-only edits retain a decision. A change to activity/date/minutes/distance/HR clears reviewer/reason and reevaluates persisted evidence at a new entry version. Historical audit rows remain. | Correcting minutes after approval requires a new decision; editing a note does not. | Deployed and integration-tested |
| Coach scope/privacy | Authorization is explicit coach-to-team membership. Service reads and mutations resolve membership before team/athlete data. | A coach without the target team membership receives no overview, report, setting mutation, review, or evidence access. | Deployed; five memberships active and ten unassigned staff receive the explicit account state |
| Dispatcher | Vercel Hobby cannot schedule sub-daily work. Use the durable Postgres job as authority, immediate post-save dispatch as an optimization, and Supabase Cron/`pg_net` every five minutes for recovery. | First retry is eligible after roughly 60–72 seconds and runs no later than the next dispatcher under normal service availability. | Deployed; Vault 5/5, six schedules active, extraction invocation HTTP 200 |
| Worker bounds | Four concurrent claims, at most 100 per dispatch, stop new claims at 210 seconds within a 300-second function. Three attempts with lease/token guards. | Concurrent dispatcher calls may repeat provider work after ambiguity, but cannot both apply the same stale claim. | Deployed and concurrency-tested |
| Model | Use stable `gemini-3.8-flash` through `@google/genai`, strict structured output/Zod, low thinking, and 60-second timeout. Model extracts; deterministic rules/coaches decide. | A confident but mismatching response still needs review. | Deployed; the five-set benchmark remains non-statistical |
| Weekly recap | One delivery row per recipient/team/week, one address per message, Sunday 20:00 New York gate, two UTC daily invocations to cover DST, and <48-hour catch-up. Enqueue/delivery precedes best-effort aggregate repair; a five-minute Supabase delivery-only dispatcher executes persisted retries without enqueue or rebuild. | A repair failure cannot suppress a due recap. A transient first/second send failure is eligible at +5/+30 minutes; duplicate invocations cannot create a second successful delivery for the same key. | Deployed; two Brevo deliveries succeeded, Apple Mail visual check passed, and exact window/DST tests passed |
| Retention | New attachments receive week cutoff plus seven New York calendar days. History survives image deletion. | Ordinary image lifetime is about 7–14 days from upload, depending on submission time. | Deployed; 904 rows and 867 objects reconciled to zero while 591 entries were preserved |

## Operational closeout and follow-ups

### Historical proof cleanup

Completed with bounded, retry-safe reconciliation: 904 proof rows and 867 Storage objects were reconciled, zero targeted rows or objects remained, and all 591 training entries were preserved.

### Legacy extraction backlog

Production reconciliation completed. The durable worker is active and the verified extraction invocation returned HTTP 200; the historical 843-row pre-release count is not a current backlog measurement.

### Automatic approval rollout

Recommended choice: use shadow/manual-review mode for a small cohort until a held-out corpus demonstrates the precision gate. Workout saving must remain enabled even if automatic decisions are disabled.

### Cross-region placement

Observed: Vercel functions are in `iad1`, while the database pooler hostname indicates `us-west-2`. Measure Vercel-to-Postgres RTT and query time before deciding whether to move compute or data. No region change is authorized from hostname evidence alone.
