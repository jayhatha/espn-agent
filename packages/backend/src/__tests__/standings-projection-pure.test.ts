import { describe, it, expect } from "vitest";
import { computeCategoryProjections } from "../agents/standings-projection.js";
import type { AllocationResult } from "../projection/types.js";
import type { Category } from "../../../shared/dist/index.js";

/**
 * Unit tests for computeCategoryProjections — pure function, no DB.
 */

const fakeAllocResult: AllocationResult = {
  batterComponents: { AB: 200, H: 60, BB: 20, HBP: 2, SF: 1, TB: 90, R: 30, HR: 8, RBI: 25, SB: 5 },
  pitcherComponents: { IP: 50, ER: 18, HA: 44, BBA: 16, K: 48, W: 4, SV: 2 },
  assignments: [],
  gaps: [],
  gsScaleFactor: 1,
  prorateFactor: 1,
  batterConfidence: {},
  pitcherConfidence: {},
};

const hrCategory: Category = {
  category_id: "HR",
  stat_key: "HR",
  name: "Home Runs",
  type: "COUNTING",
  direction: "HIGHER_BETTER",
  formula_id: null,
};

const avgCategory: Category = {
  category_id: "AVG",
  stat_key: "AVG",
  name: "Batting Average",
  type: "RATE",
  direction: "HIGHER_BETTER",
  formula_id: "avg",
};

const eraCategory: Category = {
  category_id: "ERA",
  stat_key: "ERA",
  name: "ERA",
  type: "RATE",
  direction: "LOWER_BETTER",
  formula_id: "era",
};

describe("computeCategoryProjections", () => {
  it("adds projected counting stat to current total", () => {
    const currentTotals = [
      { category_id: "HR", value: 10, components_json: null },
    ];
    const result = computeCategoryProjections(fakeAllocResult, currentTotals, [hrCategory]);
    const hr = result.get("HR");
    expect(hr).toBeDefined();
    expect(hr!.value).toBe(18); // 10 current + 8 projected
    expect(hr!.isDegraded).toBe(false);
  });

  it("computes AVG using component math (not averaging rates)", () => {
    // currentTotals: 50 H / 180 AB = .278
    // projected: 60 H / 200 AB = .300
    // combined: 110 H / 380 AB = .289 (approximately)
    const currentTotals = [
      { category_id: "AVG", value: 0.278, components_json: { H: 50, AB: 180 } },
    ];
    const result = computeCategoryProjections(fakeAllocResult, currentTotals, [avgCategory]);
    const avg = result.get("AVG");
    expect(avg).toBeDefined();
    expect(avg!.isDegraded).toBe(false);
    // 110 / 380 ≈ 0.289
    expect(avg!.value).toBeCloseTo(110 / 380, 3);
  });

  it("computes ERA using component math", () => {
    // current: 18 ER / 40 IP = 4.05
    // projected: 18 ER / 50 IP = 3.24
    // combined: 36 ER / 90 IP = 3.60
    const currentTotals = [
      { category_id: "ERA", value: 4.05, components_json: { ER: 18, IP: 40 } },
    ];
    const result = computeCategoryProjections(fakeAllocResult, currentTotals, [eraCategory]);
    const era = result.get("ERA");
    expect(era).toBeDefined();
    expect(era!.isDegraded).toBe(false);
    // 36 ER / 90 IP * 9 = 3.6
    expect(era!.value).toBeCloseTo(3.6, 2);
  });

  it("marks rate stat degraded when no projected denominator", () => {
    const noAbResult: AllocationResult = {
      ...fakeAllocResult,
      batterComponents: { AB: 0, H: 0 }, // AB = 0 → no denominator
    };
    const currentTotals = [
      { category_id: "AVG", value: 0.285, components_json: { H: 50, AB: 175 } },
    ];
    const result = computeCategoryProjections(noAbResult, currentTotals, [avgCategory]);
    const avg = result.get("AVG");
    expect(avg).toBeDefined();
    expect(avg!.isDegraded).toBe(true);
    expect(avg!.value).toBe(0.285); // falls back to current ESPN rate
  });

  it("handles missing currentTotals (new season, no actuals yet)", () => {
    const result = computeCategoryProjections(fakeAllocResult, [], [hrCategory]);
    const hr = result.get("HR");
    expect(hr).toBeDefined();
    expect(hr!.value).toBe(8); // 0 current + 8 projected
    expect(hr!.isDegraded).toBe(false);
  });
});
