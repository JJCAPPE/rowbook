import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { buildWeekOptions } from "../../../apps/web/src/lib/week-options.ts";

describe("web/lib/week-options", () => {
  it("builds descending week options from reference date", () => {
    const referenceDate = DateTime.fromISO("2026-02-12T12:00:00", {
      zone: "America/New_York",
    }).toJSDate();

    const options = buildWeekOptions(3, referenceDate);

    expect(options).toHaveLength(3);
    expect(options[0].start.getTime()).toBeGreaterThan(options[1].start.getTime());
    expect(options[1].start.getTime()).toBeGreaterThan(options[2].start.getTime());
  });

  it("includes human-readable labels", () => {
    const options = buildWeekOptions(1, new Date("2026-02-12T12:00:00Z"));

    expect(options[0]?.label).toContain("-");
  });
});
