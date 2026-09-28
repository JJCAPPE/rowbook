# OpenAI workout-proof benchmark — September 28, 2026

## Configuration and scope

OpenAI `gpt-6-luna`, Responses API, low reasoning, high-detail images, strict JSON, Standard processing, `store: false`, 2,000 output tokens maximum (including reasoning). Gemini remains an explicit alternate; there is no silent provider fallback.

The final run made eight real requests over the six original photos in `tests/test-photos`. HEIC photos were converted in temporary storage. The benchmark did not connect to a database, create workouts, change original photos, or reprocess submitted workouts.

## Results

All eight validation scenarios passed (nine Node test results including the parent test):

- Concept2 RowErg: 1,269 active seconds, 21 whole minutes.
- Concept2 BikeErg sessions: 3,600 / 3,600 / 5,400 active seconds, excluding programmed rest.
- Garmin summary: 5,520 seconds, 92 whole minutes.
- Garmin + Strava: one session, not two; conservative 5,519 seconds, 91 whole minutes for the one-second display discrepancy.
- Strava alone: explicitly shows **Elapsed Time**, not active time; correctly requires review.
- Two different workout dates: correctly cannot be combined and approved.

For all six usable evidence sets, equal and lower claims passed; one extra minute, a different date, and doubled minutes did not pass. Required dates and durations remain strict assertions.

Activity labels are informational under the requested approval policy and are reported separately. The final run returned null instead of OTHER on Garmin and the combined pair. Earlier tuning runs sometimes mislabeled BikeErg as ERG. Athlete-entered activity is not changed by the verification decision; optional category errors do not create extra manual review. This is a remaining extraction-quality limitation, not a claim that every field is always correct.

## Measured API cost

Rates verified against [OpenAI Standard pricing](https://developers.openai.com/api/docs/pricing): per million tokens, Luna input $0.10, cached reads $0.01, cache writes $0.125, output $0.50. Image tokens are included in input; reasoning is already included in output and must not be counted twice.

| Evidence set | Input tokens | Output incl. reasoning | Actual cost | Conservative no-cache cost |
| --- | ---: | ---: | ---: | ---: |
| Concept2 RowErg | 4,090 | 147 | $0.000115 | $0.000585 |
| Concept2 BikeErg 2x30 | 4,101 | 364 | $0.000223 | $0.000695 |
| Concept2 BikeErg second session | 4,101 | 459 | $0.000742 | $0.000742 |
| Concept2 BikeErg 3x30 | 4,101 | 349 | $0.000216 | $0.000687 |
| Garmin cardio | 4,011 | 153 | $0.000117 | $0.000578 |
| Strava elapsed-only | 4,011 | 233 | $0.000157 | $0.000618 |
| Garmin + Strava | 6,863 | 321 | $0.000229 | $0.001018 |
| Different-workout negative control | 7,043 | 183 | $0.000972 | $0.000972 |

Final run total: **$0.00277074**. Several repeated fixtures hit the provider cache, so that discount is not used for budgeting future unique photos.

- 500 submissions at this mix, charging every input token at the cache-write rate: **$0.37**.
- 500 submissions each costing as much as the most expensive no-cache sample: **$0.51**.
- All seven comparison/tuning runs combined (56 requests, including eight on GPT-6 Sol): approximately **$0.127**.

A submission here means one evidence-set extraction, with one or two photos in these examples. More photos, larger inputs, repeated attempts, price changes, and hosting/storage are not included in the monthly sample projection. This is an estimate, not an enforced monthly spending cap.

The $10/month API target has ample headroom for this workload. No aggressive image compression is needed: readable digits matter more than shaving fractions of a cent. Existing efficiencies include the small model, low reasoning, compact structured output, a fixed output cap, and one consolidated call for the evidence set. Usage counters (including cache reads/writes and reasoning) are saved for new production extractions.

## Other verification

88 unit tests and 27 isolated-database integration tests passed, including provider failures, token metadata persistence, overclaims, rejected-evidence edits, historical credit, and unchanged legacy extraction jobs. Lint, TypeScript, and the production build passed. No live test entries were submitted.

Run `npm run test:provider` to repeat the paid benchmark. Results and labels can vary; all dates, duration limits, and approval decisions remain enforced by assertions.
