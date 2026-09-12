# Extraction benchmark

## Scope and identity

- Base SHA: `ea32ffd0f61941a81e2b81718089efcd3ebfe6ca`; candidate was an uncommitted working tree.
- Environment: explicit local `npm run test:provider` using the configured Gemini Developer API account.
- Configuration: `@google/genai`, `gemini-3.8-flash`, low thinking, temperature 0, JSON response schema, Zod validation, 700 maximum output tokens, 60-second request timeout.
- Corpus: five development evidence sets / six images. Raw images are deliberately excluded from this audit.
- Split: development fixtures only. There is no independent holdout, source-template separation, or human-agreement study.
- Fixture IDs: `C2-R-01` (one RowErg image), `C2-B-01..03` (three BikeErg images converted locally from HEIC to JPEG), and `GS-01` (one Garmin plus one Strava screenshot representing the same workout).

Google's official [model page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash) listed `gemini-3.8-flash` as stable, with a 2026-09-02 update. The official [Gemini Developer API pricing page](https://ai.google.dev/gemini-api/docs/pricing) showed paid Standard introductory rates of $0.75 per million input tokens and $3.75 per million output tokens, including thinking tokens, through 2026-12-31 when checked on 2026-09-11. Rates must be rechecked before a later cost decision.

## Results

| Fixture | Images/call | Assertion result | Successful latency | Input tokens | Reported candidate-output tokens |
| --- | ---: | --- | ---: | ---: | ---: |
| `C2-R-01` | 1 | Pass | 6,017 ms | 1,525 | 106 |
| `C2-B-01` | 1 | Pass | 4,578 ms | 1,489 | 119 |
| `C2-B-02` | 1 | Pass | 7,322 ms | 1,489 | 120 |
| `C2-B-03` | 1 | Pass after retry | 2,896 ms | 1,489 | 120 |
| `GS-01` | 2 | Pass | 2,686 ms | 2,581 | 74 |

Successful-call latency, `n=5`: p50 4,578 ms; nearest-rank p95 7,322 ms. One earlier `C2-B-03` attempt failed as `provider-unavailable` after 16,333 ms, so six provider calls were made. Failure token usage was not recorded.

The assertions covered activity type, calendar date, duration, distance where applicable, average heart rate where available, single-workout classification, and Garmin/Strava consolidation. `GS-01` returned 92 minutes once, not 184 minutes. All five sets passed the encoded assertions, or 100% observed. The Wilson 95% interval for 5/5 is approximately 56.6%–100%, which demonstrates why this is not a population-quality claim.

## Cost calculation

The five successful responses reported 8,573 input tokens and 539 candidate-output tokens. At the rates above:

```text
observed successful-call subtotal
= 8,573 × $0.75 / 1,000,000
  + 539 × $3.75 / 1,000,000
= $0.008451 total
= $0.0016902 per successful fixture
```

This is a **lower bound**, not actual billed cost. The current metadata records candidate output but not thinking-token usage, and the failed attempt has no usage record. Image token accounting is reflected only insofar as the provider included it in `promptTokenCount`.

At that incomplete observed subtotal, 11,520 season workouts would be about $19.47 and the 5× scenario about $97.36. These projections must not be used as a budget because they omit thinking, failures/fallbacks, abandoned drafts, function compute, database, Storage, egress, dispatch, logs, and email.

## Chosen approach

Provisional choice: retain the maintained SDK and stable `gemini-3.8-flash` configuration, one call per immutable evidence-set revision, with deterministic validation and coach review deciding acceptance. Keep three total attempts for transient failures. Automatic approval remains conditional on complete required fields, consistent images, exact rule matches, and confidence of at least 0.92.

Confidence in this choice is moderate for implementation compatibility and low for population quality/cost. The five-set development corpus is too small and narrow to satisfy the proposed ≥95% required-field correctness or ≥99% auto-approval precision gates.

## Required next experiment

1. Build at least 200 labeled, privacy-cleared evidence sets and keep related screenshots in one split.
2. Include PM5 variations, Garmin, Strava, Polar, glare, blur, rotation, crop, missing fields, duplicates, invalid files, and complementary screens.
3. Freeze capture/reference dates and label moving/elapsed/interval/rest semantics and units.
4. Reserve a source/template-separated holdout. Record independent human agreement for ambiguous cases.
5. Compare the current model with one maintained lower-cost model and deterministic OCR/parser plus model fallback.
6. Report per-source field accuracy, auto-approval precision/coverage, review rate, false approvals/rejections, p50/p95 queue plus provider latency, every call, thinking tokens, and billed cost.
7. Keep normal CI provider-free; run the benchmark only through the explicit capped command.

Pending evidence: holdout quality, confidence intervals by group, calibrated auto-approval precision, device normalization impact, exact billed usage, quota/rate-limit behavior, fallback value, and production queue latency.

Responsible files: explicit provider harness, extraction service, evidence worker/repository, shared proof schema and upload normalization. Owner: ML/operations with privacy review. Dependency: a privacy-cleared, source-separated labeled corpus and current billing export. Estimated focused effort: 1–3 days after the corpus exists.
