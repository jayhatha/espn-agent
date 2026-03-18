import { describe, it, expect } from "vitest";
import { computeBudgetCurve } from "../budget-curve";

// ============================================================
// Helpers
// ============================================================

/**
 * Convenience wrapper with sensible defaults.
 * Override any param to exercise specific paths.
 */
function makeBudgetCurve(
  overrides: Partial<{
    remainingBudget: number;
    remainingRosterSpots: number;
    totalBudget: number;
    totalRosterSize: number;
    inflationFactor: number;
    currentPlayerDollarValue: number;
    hitterSpent: number;
    pitcherSpent: number;
  }> = {},
) {
  const defaults = {
    remainingBudget: 100,
    remainingRosterSpots: 10,
    totalBudget: 260,
    totalRosterSize: 23,
    inflationFactor: 1.0,
    currentPlayerDollarValue: 10,
    hitterSpent: 0,
    pitcherSpent: 0,
  };
  const opts = { ...defaults, ...overrides };
  return computeBudgetCurve(
    opts.remainingBudget,
    opts.remainingRosterSpots,
    opts.totalBudget,
    opts.totalRosterSize,
    opts.inflationFactor,
    opts.currentPlayerDollarValue,
    opts.hitterSpent,
    opts.pitcherSpent,
  );
}

// ============================================================
// Tests
// ============================================================

describe("computeBudgetCurve", () => {
  // 1. Endgame mode: activates at $20, off at $21
  it("activates endgameMode when remainingBudget <= 20", () => {
    const result = makeBudgetCurve({ remainingBudget: 20 });
    expect(result.endgameMode).toBe(true);
  });

  it("does not activate endgameMode when remainingBudget > 20", () => {
    const result = makeBudgetCurve({ remainingBudget: 21 });
    expect(result.endgameMode).toBe(false);
  });

  it("activates endgameMode at remainingBudget=1 (edge of range)", () => {
    const result = makeBudgetCurve({ remainingBudget: 1 });
    expect(result.endgameMode).toBe(true);
  });

  // 2. Pacing status
  it("returns pacingStatus=ahead when budgetPressure > 1.05", () => {
    // To get high budget pressure: remaining budget >> optimal remaining
    // With roster 90% full (1 spot left of 23) optimal = 260 * (1 - 0.9*22/23) = 260 * 0.139 = ~36
    // But we have $100 remaining: 100/36 >> 1.05
    const result = makeBudgetCurve({
      remainingBudget: 100,
      remainingRosterSpots: 1,
      totalBudget: 260,
      totalRosterSize: 23,
    });
    expect(result.pacingStatus).toBe("ahead");
    expect(result.budgetPressure).toBeGreaterThan(1.05);
  });

  it("returns pacingStatus=behind when budgetPressure < 0.95", () => {
    // Spend a lot early: 22/23 spots filled, tiny budget remaining
    // Optimal remaining at 1/23 progress ~= 260*(1 - 0.9/23) = 260*0.961 = $249.8
    // But only $10 left: 10/249.8 << 0.95
    const result = makeBudgetCurve({
      remainingBudget: 10,
      remainingRosterSpots: 22,
      totalBudget: 260,
      totalRosterSize: 23,
    });
    expect(result.pacingStatus).toBe("behind");
    expect(result.budgetPressure).toBeLessThan(0.95);
  });

  it("returns pacingStatus=on-track when budgetPressure is 0.95-1.05", () => {
    // Perfectly paced: halfway through roster, halfway through budget
    // rosterProgress = 1 - 11.5/23 = 0.5, expectedSpentFraction = 0.45
    // optimalRemaining = 260 * 0.55 = 143
    // budgetPressure = 143/143 = 1.0
    const result = makeBudgetCurve({
      remainingBudget: 143,
      remainingRosterSpots: 12, // approx half of 23
      totalBudget: 260,
      totalRosterSize: 23,
    });
    expect(result.pacingStatus).toBe("on-track");
    expect(result.budgetPressure).toBeGreaterThanOrEqual(0.95);
    expect(result.budgetPressure).toBeLessThanOrEqual(1.05);
  });

  // 3. Min reserve: with N remaining spots, reserve = N - 1
  it("calculates minReserve as remainingRosterSpots - 1", () => {
    // 10 spots remaining: reserve = 9
    // usableBudget = remainingBudget - minReserve = 100 - 9 = 91
    const result = makeBudgetCurve({
      remainingBudget: 100,
      remainingRosterSpots: 10,
    });
    // averageRemainingPerPlayer = usableBudget / remainingRosterSpots = 91 / 10 = 9.1
    expect(result.averageRemainingPerPlayer).toBeCloseTo(9.1, 1);
  });

  // 4. Max bid recommendation: caps at 35% of usable budget, 110% of inflation-adjusted, >= 1
  it("caps maxBidRecommendation at 35% of usable budget", () => {
    // usableBudget = 100 - 9 = 91, 35% = 31.85 => floor 31
    // inflationAdjustedValue = round(50 * 1.0) = 50
    // maxBidFromValue = round(50 * 1.1) = 55
    // min(55, 31, 91) = 31
    const result = makeBudgetCurve({
      remainingBudget: 100,
      remainingRosterSpots: 10,
      inflationFactor: 1.0,
      currentPlayerDollarValue: 50,
    });
    expect(result.maxBidRecommendation).toBe(31);
  });

  it("caps maxBidRecommendation at 110% of inflation-adjusted value", () => {
    // usableBudget = 200 - 9 = 191, 35% = 66.85 => floor 66
    // inflationAdjustedValue = round(10 * 1.0) = 10
    // maxBidFromValue = round(10 * 1.1) = 11
    // min(11, 66, 191) = 11
    const result = makeBudgetCurve({
      remainingBudget: 200,
      remainingRosterSpots: 10,
      inflationFactor: 1.0,
      currentPlayerDollarValue: 10,
    });
    expect(result.maxBidRecommendation).toBe(11);
  });

  it("ensures maxBidRecommendation is >= 1", () => {
    // Tiny budget: usable near 0
    const result = makeBudgetCurve({
      remainingBudget: 5,
      remainingRosterSpots: 5,
      currentPlayerDollarValue: 1,
    });
    expect(result.maxBidRecommendation).toBeGreaterThanOrEqual(1);
  });

  // 5. Budget targets always fixed
  it("always returns correct hitter, pitcher, and bench budget targets", () => {
    const result = makeBudgetCurve();
    expect(result.hitterBudgetTarget).toEqual({ min: 195, max: 220 });
    expect(result.pitcherBudgetTarget).toEqual({ min: 35, max: 60 });
    expect(result.benchBudget).toBe(5);
  });

  // 6. Edge case: 0 remaining roster spots => averageRemainingPerPlayer = 0
  it("returns averageRemainingPerPlayer=0 when no roster spots remain", () => {
    const result = makeBudgetCurve({
      remainingRosterSpots: 0,
      remainingBudget: 50,
    });
    expect(result.averageRemainingPerPlayer).toBe(0);
  });

  // 7. Inflation-adjusted bid
  it("computes inflationAdjustedBid as inflationFactor * playerValue", () => {
    // inflationFactor=1.5, value=10 => inflationAdjustedValue = round(15) = 15
    // usableBudget = 200 - 9 = 191; min(15, 191) = 15
    const result = makeBudgetCurve({
      remainingBudget: 200,
      remainingRosterSpots: 10,
      inflationFactor: 1.5,
      currentPlayerDollarValue: 10,
    });
    expect(result.inflationAdjustedBid).toBe(15);
  });

  it("caps inflationAdjustedBid at usableBudget", () => {
    // usableBudget = 10 - 4 = 6, inflationAdjustedValue = round(10 * 2.0) = 20
    // inflationAdjustedBid = min(20, 6) = 6
    const result = makeBudgetCurve({
      remainingBudget: 10,
      remainingRosterSpots: 5,
      inflationFactor: 2.0,
      currentPlayerDollarValue: 10,
    });
    expect(result.inflationAdjustedBid).toBe(6);
  });

  // 8. hitterSpent and pitcherSpent pass through to result
  it("passes hitterSpent and pitcherSpent through to signal", () => {
    const result = makeBudgetCurve({ hitterSpent: 120, pitcherSpent: 40 });
    expect(result.hitterSpent).toBe(120);
    expect(result.pitcherSpent).toBe(40);
  });

  // 9. remainingBudget and remainingRosterSpots pass through
  it("echoes remainingBudget and remainingRosterSpots in result", () => {
    const result = makeBudgetCurve({ remainingBudget: 77, remainingRosterSpots: 8 });
    expect(result.remainingBudget).toBe(77);
    expect(result.remainingRosterSpots).toBe(8);
  });
});
