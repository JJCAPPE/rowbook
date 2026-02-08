import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAutoVerification } from '../../apps/web/src/server/services/validation-logic.ts';

test('evaluateAutoVerification sums minutes from multiple proofs', () => {
  const result = evaluateAutoVerification(
    { date: new Date('2026-02-03T12:00:00-05:00'), minutes: 40 },
    [
      { date: '2026-02-03', minutes: 20 },
      { date: '2026-02-03', minutes: 20 },
    ],
  );

  assert.equal(result.autoVerified, true);
  assert.equal(result.validationStatus, 'VERIFIED');
});

test('evaluateAutoVerification fails when one proof date does not match entry date', () => {
  const result = evaluateAutoVerification(
    { date: new Date('2026-02-03T12:00:00-05:00'), minutes: 40 },
    [
      { date: '2026-02-03', minutes: 20 },
      { date: '2026-02-02', minutes: 20 },
    ],
  );

  assert.equal(result.autoVerified, false);
  assert.equal(result.validationStatus, 'PENDING');
});
