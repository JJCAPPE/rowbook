import { describe, expect, it } from "vitest";

import {
  calculatePaceSeconds,
  calculateWatts,
  formatPace,
  formatPaceWithUnit,
  formatWatts,
  supportsPace,
  supportsWatts,
} from "../../../packages/shared/src/utils/pace.ts";

describe("shared/utils/pace", () => {
  it("calculates pace by activity-specific unit", () => {
    expect(calculatePaceSeconds("ERG", 10, 40)).toBe(120);
    expect(calculatePaceSeconds("RUN", 10, 40)).toBe(240);
    expect(calculatePaceSeconds("SWIM", 1, 10)).toBe(60);
  });

  it("returns null pace for unsupported or invalid inputs", () => {
    expect(calculatePaceSeconds("OTHER", 10, 40)).toBeNull();
    expect(calculatePaceSeconds("RUN", 0, 40)).toBeNull();
    expect(calculatePaceSeconds("RUN", 10, 0)).toBeNull();
  });

  it("calculates watts for concept2 activities", () => {
    const ergWatts = calculateWatts("ERG", 120);
    const cycleWatts = calculateWatts("CYCLE", 120);

    expect(ergWatts).not.toBeNull();
    expect(cycleWatts).not.toBeNull();
    expect(calculateWatts("RUN", 120)).toBeNull();
  });

  it("formats pace and watts for display", () => {
    expect(formatPace(125)).toBe("2:05");
    expect(formatPaceWithUnit("ERG", 125)).toBe("2:05/500m");
    expect(formatWatts(244.6)).toBe("245 W");
  });

  it("exposes supported pace and watts activity types", () => {
    expect(supportsWatts("ERG")).toBe(true);
    expect(supportsWatts("RUN")).toBe(false);
    expect(supportsPace("RUN")).toBe(true);
    expect(supportsPace("OTHER")).toBe(false);
  });
});
