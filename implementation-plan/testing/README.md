# Testing Plan

Quality strategy to keep both UI and backend stable as the app grows.

## Unit Tests

- Week boundary calculations (Sunday 6:00 PM ET)
- Validation rules (distance truncation, HR handling)
- Aggregation functions (weekly totals, status)

## Integration Tests

- Training entry creation flow (with proof upload)
- Edit lock at weekly cutoff
- Coach overrides and exemptions
- Aggregation job output matches entry data

## End-to-End Tests

Using Playwright:

- Athlete login, log workout, view dashboard
- Coach login, team overview, athlete detail
- Weekly leaderboard display

## Performance Checks

- Weekly aggregation job runtime
- Dashboard render and list scrolling on mobile

## Security Tests

- Role-based access: athlete cannot view others
- Proof image access only via signed URLs
