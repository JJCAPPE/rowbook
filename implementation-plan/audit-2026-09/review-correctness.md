# Coach review and data correctness

Base SHA: `ea32ffd0f61941a81e2b81718089efcd3ebfe6ca`; candidate was uncommitted. Environment: source review plus isolated local PostgreSQL integration tests. No authenticated production review mutation was performed.

Fixture references: `DB-REVIEW-RACE-01`, `DB-ENTRY-RACE-01`, and `DB-WORKER-LEASE-01` name the disposable rows created by the integration suite; they are audit aliases, not retained database IDs.

## Review flow

1. Coach selects a week and one of checking, needs-review, or completed states.
2. Server resolves coach-team membership, applies week/state filters, orders deterministically, and returns metadata-first pages of 20.
3. Opening one entry requests authorized signed evidence on demand; initial queue responses do not sign every image.
4. Entered and extracted values/reason are shown beside evidence. Rejection uses an inline accessible reason field; blank reasons are rejected.
5. Approve/reject sends the expected entry version. The row shows pending state; an error/conflict remains visible and retryable.
6. One transaction updates entry, linked proofs, reviewer/timestamp/reason, version and audit. Aggregate reconciliation follows outside the decision transaction.

Source review confirms that completed items expose no action controls, proof viewer behavior is dialog-based, and the backend accepts only `VERIFIED` or `REJECTED` review decisions.

## Rule table

| Rule | Automatic outcome | Coach implication | Evidence |
| --- | --- | --- | --- |
| No persisted result yet | `NOT_CHECKED`/`PENDING` | Wait or review when surfaced | Unit/source |
| Required date/minutes missing; required distance missing | `EXTRACTION_INCOMPLETE` | Manual review, never automatic rejection | Unit/integration |
| Date/activity/minutes mismatch | `PENDING` | Compare exact disagreement | Unit |
| Distance mismatch | `PENDING` at 0.1 km truncation | Compare normalized units | Unit |
| HR absent on either side | No failure from absence | Do not describe optional HR as missing proof | Unit |
| HR present on both and mismatched | `PENDING` | Review disagreement | Source |
| Multiple results disagree | `PENDING`; never summed | Inspect images as one evidence set | Unit/provider fixture |
| Confidence below 0.92 or not a single workout | `PENDING` | Human decision required | Unit |
| All required values agree | `VERIFIED` | No queue action required | Unit/provider fixture |
| Provider retries exhausted | `EXTRACTION_INCOMPLETE` if entry is still mutable/current | Human review; save remains valid | Integration |

## Concurrency contract

- Entry updates and review decisions require `expectedVersion` and compare-and-set update exactly one row.
- A second simultaneous coach receives a conflict; it cannot silently replace the first decision.
- Review completion sets reviewer identity/time. A worker finalizer checks claim token, evidence key/revision, entry version and manual/final state before applying.
- Athlete changes to decision-bearing fields clear manual reviewer/reason and reevaluate persisted evidence; notes-only changes retain the decision.
- Terminal worker failure changes only a current mutable entry/proof set and records an audit event.
- Weekly totals are derived from canonical entries. Per-athlete/week aggregate updates use a transaction-level advisory lock and canonical re-read.

## Executed invariant tests

| Reproduction | Expected | Actual |
| --- | --- | --- |
| Two coaches decide the same entry/version concurrently | One accepted, one conflict | Passed |
| Worker completes after a coach decision | Manual result remains | Passed |
| Two athlete edits use the same old version | One accepted, one conflict | Passed |
| Retry same submission concurrently | One entry/job/create audit | Passed |
| Reuse identical proof bytes sequentially/concurrently | Later attachment rejected | Passed |
| Expired lease claimed after deadline; stale claimant writes | New claim valid; stale token ignored | Passed |
| Terminal/exhausted job on mutable entry | Entry/proofs incomplete plus audit, once | Passed |

The final local pass reported 21/21 integration tests and 37/37 unit tests. Sample sizes are deliberately small and synthetic; they establish invariants, not production throughput.

## Authorization

Candidate service paths require explicit coach-team membership for overview, athlete detail, review evidence/decision, requirements, exemptions, overrides and reporting. Athlete entry/proof paths require ownership. The migration backfills only active coach/admin relationships evidenced by historical review, requirement, exemption, override, or team-settings actions. Ambiguous accounts receive no team access until explicitly assigned.

Cross-team source guards are present. A complete outsider-coach router/browser matrix is pending production-like authentication and should cover guessed IDs, pagination cursors, proof signing, reporting and settings.

## Remaining review evidence

- Fixed 20-item coach task baseline and candidate time; target ≥50% improvement and p50 ≤15 seconds.
- Next-item prefetch/useful latency, scroll/selection stability, mutation rollback, and pagination during concurrent inserts.
- 320 px, tablet and desktop evidence layout; keyboard-only, VoiceOver, 200% text and expired/deleted-photo states.
- Athlete correction versus in-flight coach request with visible conflict in the browser.
- Aggregate freshness within two seconds in another active browser and reconciliation after reconnect.
- Product-owner ratification of post-review edit/reset semantics and explicit dispositions for active staff left unassigned by the evidence-based membership backfill.

Responsible files: coach review page, proof viewer, coach router/service, validation service, evidence repository/worker, entry service, requirement service, reporting service/router, weekly service, shared validation and schemas. Remaining owner: review/frontend QA with backend support. Dependency: deployed additive schema and isolated athlete/two-coach/two-team fixtures. Effort: 1–2 days for authenticated/device verification, plus scale-test time.
