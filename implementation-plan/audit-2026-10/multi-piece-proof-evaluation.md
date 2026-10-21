# Multi-piece workout proof evaluation

Evaluated October 21, 2026 (America/New_York). Production baseline: `21082e2`, prompt `workout-proof-v4`, schema `evidence-v3`. Candidate: `workout-proof-v5`, `evidence-v4`. Both use the existing `gpt-6-luna` model, high-detail original photos, low reasoning, the original evidence-job reference date, and the unchanged 0.92 approval threshold. Claimed minutes are never sent to the model.

## Change

The provider returns distinct completed pieces with their supporting image numbers, dates, and active seconds. Application code validates image attribution and dates, sums seconds, then floors the total to whole minutes. Duplicate/complementary views and full summaries with their splits count once. Rest is excluded. Uncertain overlap, conflicting dates, missing active duration, repeated image bytes counted across pieces, and impossible totals cannot automatically approve a claim.

The existing aggregate result remains compatible with jobs, stored JSON, forms, and validation. `isSingleWorkout` means evidence safely supports one logged workout, potentially containing multiple same-day pieces. Legacy independent photo results are still never blindly summed. No database migration, approval-threshold change, or model change is needed.

## Historical evidence

Read production records and downloaded their retained proofs without changing entries or approvals. Included all seven manually reviewed entries with retained photos and the eight most recent automatically verified entries. Original photos were visually inspected before interpreting results. There were no retained rejected entries in the query, so constructed negative controls supplement the historical sample.

| Manually approved entry prefix | Visible active work, October 20 | Old checker | Candidate first / repeat |
| --- | --- | --- | --- |
| `cmvha5coi` | Two different PM5 results: 20:00 + 20:00 = 40 min | Manual review | 40 min, approved / approved |
| `cmvhd73la` | Different distances/splits: 22:30 + 22:30 = 45 min | Manual review | 45 min, confidence review / approved |
| `cmvhf76yy` | 20:00 + 25:00 active = 45 min; second result includes 4 min rest | Manual review | 45 min, approved / approved |

Both candidate runs recovered all three exact totals: 6/6 readings, with 5/6 automatic approvals. The remaining decision had confidence 0.91, below the unchanged threshold. The baseline rerun and stored baseline decisions approved none of these three.

Other manual approvals were not treated as proof of automatic eligibility: a machine/watch pair has uncertain overlap/date, one RP3 interval result is incomplete on-screen, another pair does not establish the claimed date, and a Garmin screen displays weekly rather than workout duration. All four remained in review.

## Controls and limits

- First comparison: 22 scenarios per implementation (15 historical entries and seven constructed combinations/claims). Automatic approvals rose from 7 to 9; neither implementation automatically approved the 10 unsupported or ambiguous claims.
- Candidate extracted all eight existing control workouts' correct durations. Seven auto-approved initially; a complementary machine/watch pair scored 0.91, then 0.96 on repeat and approved. The baseline rerun also approved seven of eight, missing a different single-photo control. Model confidence varies between calls.
- Repeated 11 relevant candidate scenarios: all five supported claims approved and all six negative controls remained unapproved.
- Two extra controls resized/re-encoded an original photo so byte hashes differed. The checker still counted it once: a duplicate 20-minute result supported 20, not 40; two real 20-minute pieces plus a duplicate supported 40, not 60.
- Across 35 candidate replay calls, all 18 unsupported/ambiguous decisions remained unapproved. This is a small selected sample, not a population accuracy or false-positive estimate.
- An exploratory 13-call GPT-5.4 Mini comparison was less reliable on these photos, including collapsing two distinct 22:30 results into one. It is not part of the release.
- All eight existing live provider fixtures passed: five single-photo positives, elapsed-only rejection, Garmin/Strava consolidation (5,519 seconds supports 91, not 92 minutes), and different-date rejection.

Unit regressions cover the three current historical sums, the earlier 601 + 1,200 + 1,200-second example, flooring after summation, duplicate attribution, incomplete evidence, invalid dates, conflicting dates, active/elapsed contradictions, overlap review, and 24-hour limits. An independent review caught JavaScript normalizing February 30 into March; exact date round-tripping now rejects it, with a regression that failed before the fix.

Photos, full entry identifiers, storage paths, and raw provider outputs remain outside Git in a private temporary evaluation directory. Evaluation helpers remain local under `tmp/research/`; no athlete data is packaged with the release. Existing approvals were not reprocessed or changed.
