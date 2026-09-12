# Upload and extraction reliability

Base SHA: `ea32ffd0f61941a81e2b81718089efcd3ebfe6ca`; reviewed candidate: uncommitted working tree. Environment: source inspection, unit/integration tests on macOS/local PostgreSQL, six bounded provider calls, and metadata-only production reads. Fixtures: anonymized `C2-R-01`, `C2-B-01..03`, and `GS-01`; raw images are excluded.

## Current candidate contract

```text
select → immediate local preview → normalize → authorize → upload → confirm
                                                        ↓
                         save transaction: entry + exact attachments + job + audit
                                                        ↓
                   immediate worker attempt; five-minute durable reconciliation
                                                        ↓
                canonical result + deterministic rule evaluation or coach review
```

The user-visible file states are queued, preparing, uploading with real bytes/percent, confirming, ready, and recoverable error. The form preserves a stable client submission ID, restores an interrupted save intent, clears object URLs/state after success, and processes at most two files concurrently.

## File and storage behavior

| Concern | Candidate behavior | Evidence |
| --- | --- | --- |
| Formats | Detects JPEG/PNG/WebP/HEIC/HEIF using MIME, extension, and header; converts to JPEG | Source + unit tests for header/extension/unknown cases; exact real-device picker pending |
| Size/dimensions | Maximum six files, 10 MiB each after preparation, 2,200 px long edge, bounded pixel area, no upscaling | Source/schema/unit tests; oversized real-photo browser pass pending |
| HEIC | Primary `heic2any`, fallback `heic-to`, then canvas JPEG | Source inspected; provider HEIC fixtures were converted by macOS for the provider test, not proof of browser decode |
| Progress | XHR upload events report actual loaded/total bytes; 60-second timeout and cancellation handle | Fake-XHR unit test passed |
| Retry | Retry only failed transfer/confirmation items; successful items remain | Source inspected; injected browser network failure pending |
| Preview lifecycle | Object URL appears when selected and is revoked on replace/remove/reset/unmount | Source inspected; selection-to-preview latency unmeasured |
| Confirmation | Server downloads object, verifies existence, magic type, declared/stored size, MIME and SHA-256 before setting `uploadedAt` | Unit tests cover valid, spoofed and corrupt bytes |

## Save integrity

The entry service requires 1–6 unique proof IDs, the same athlete and client submission, confirmed bytes, no deletion/expiry, no prior attachment, no legacy reference, and no same-content replay. It derives a canonical submission hash and has a unique `(athleteId, clientSubmissionId)` constraint.

One short database transaction creates the entry, claims every proof, rebases retention to the credited week, creates one evidence-set job, and writes the audit row. Provider work and aggregate reconciliation occur outside that transaction. A matching lost-response retry returns the existing entry; the same key with changed values conflicts.

Verified local reproductions:

- concurrent identical save intent produced one entry, one job, and one create audit;
- the same key with different values was rejected;
- sequential and concurrent identical-byte reuse was rejected;
- more than six proofs was rejected before saving;
- an expired proof could not attach;
- zero production proofs were both attached and unconfirmed at the read-only snapshot.

## Extraction/job behavior

- One immutable evidence revision and ordered proof/hash manifest maps to one job/result. The removed synchronous extraction RPC leaves no second UI-triggered model path.
- Jobs are claimed with `FOR UPDATE SKIP LOCKED`, a two-minute lease, random claim token, priority/order, three total attempts, and 60-second provider timeout.
- Retry delays are deterministic exponential backoff with jitter: approximately 60–72 seconds then 120–144 seconds.
- Four workers drain at most 100 jobs and stop new claims after 210 seconds inside the 300-second Vercel function.
- The post-save immediate attempt is an optimization. Supabase Cron/`pg_net` calls the authenticated worker every five minutes; the database record remains authoritative.
- Final writes require the same claim token, evidence key/revision, proof set, and mutable entry version/state. Terminal failures move a still-current mutable entry/proofs to explicit incomplete/manual review with an audit.

Concurrency integration tests verified unique claims, expired-lease recovery, stale-token refusal, and that a worker cannot overwrite a coach decision. At-least-once delivery can still repeat a billable provider request after an ambiguous provider-success/process-crash boundary; state application remains guarded.

## Measured calls

Five evidence sets used five successful calls; one transient failure required a sixth call. Successful provider p50 was 4,578 ms and nearest-rank p95 7,322 ms (`n=5`). See [extraction-benchmark.md](extraction-benchmark.md). No queue-delay, upload-time, or browser-render distribution was measured.

## Extraction/dispatch options

| Option | Evidence and tradeoff | Decision |
| --- | --- | --- |
| One `gemini-3.8-flash` call per immutable evidence set through the maintained SDK | Live API/schema compatibility and five development fixtures were exercised. Handles complementary screenshots together; observed token subtotal is low, but holdout quality and full billing are unknown. | Provisional selected baseline; keep deterministic rules and manual review authoritative. |
| Legacy browser-triggered plus worker extraction | Could call the provider once for suggestions and again for persisted checking, with stale client fields and duplicated spend. | Removed; do not restore. |
| Deterministic OCR/parser with model fallback | Could reduce cost/latency for stable PM5 templates, but no implementation or source-separated accuracy benchmark exists. It adds template/rotation/locale maintenance. | Include in the ≥200-set experiment; do not add speculatively. Estimated experiment: 1–2 d after a labeled corpus exists. |
| Separate queue/workflow vendor | May add richer orchestration but creates another service and does not improve the authoritative data contract by itself. The Postgres lease path passed local concurrency tests. | Defer unless the canary misses queue/recovery/Supabase overhead targets. |

Model choice depends on the privacy-cleared holdout and recorded thinking/retry billing. Dispatcher choice depends on a deployed five-minute canary and oldest-ready age, not on source inspection alone.

## Remaining acceptance work

| Gap | Exact reproduction | Expected | Dependency / effort |
| --- | --- | --- | --- |
| Real picker/HEIC | iPhone Safari Photos and camera, portrait/landscape, empty MIME, foreground/background | Preview immediately; readable normalized JPEG; no lost draft | Real device; 0.5 d |
| Network recovery | Fail second of several uploads, timeout, cancel, reconnect, expire authorization | Successful files persist; only failed item retries; missing object never confirms | Isolated Storage; 0.5 d |
| Crash boundaries | Kill after object write, after confirmation, after DB commit, after provider response | Idempotent recovery; one entry/decision; bounded repeated billing | Deployed canary; 0.5–1 d |
| Status UX | Close/reopen page while job pending/fails/exhausts | Saved state remains distinct from verified; explicit retry/manual action | Authenticated browser; 0.5 d |
| Load | 60 athletes upload within two minutes; sustained 2× peak; repeat at 5× | No connection/provider saturation; oldest-ready age returns below target | Synthetic dataset/provider stub; 1 d |

Responsible files: `log-workout-form.tsx`, `proof-upload-client.ts`, `proof-upload-item.tsx`, proof schemas/constants, `proof-service.ts`, `entries-service.ts`, `evidence-extraction-jobs.ts`, `proof-extraction.ts`, extraction cron route, Prisma schema/migration, and Storage adapter.
