import assert from "node:assert/strict";
import test from "node:test";

import { formatDistance } from "../../apps/web/src/lib/format.ts";
import { formatPace } from "@rowbook/shared";

test("distance formatting preserves useful precision without trailing zeroes", () => {
  assert.equal(formatDistance(null), "—");
  assert.equal(formatDistance(7), "7 km");
  assert.equal(formatDistance(7.5), "7.5 km");
  assert.equal(formatDistance(7.1254), "7.125 km");
  assert.equal(formatDistance(1_234.567), "1,234.567 km");
});

test("pace formatting carries rounded seconds into the next minute", () => {
  assert.equal(formatPace(119.4), "1:59");
  assert.equal(formatPace(119.5), "2:00");
  assert.equal(formatPace(119.6), "2:00");
  assert.equal(formatPace(59.6), "1:00");
});
