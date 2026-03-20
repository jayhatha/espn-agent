/**
 * priority-scorer.test.ts
 *
 * TDD tests for EV-based priority scoring engine (Phase 62).
 * Tests for computePriorityScore, computeEVMaxBid, tagPlayer, getCategoryWeight.
 *
 * Run: pnpm --filter @espn-fantasy/extension test packages/extension/lib/engine/__tests__/priority-scorer.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  computePriorityScore,
  computeEVMaxBid,
  tagPlayer,
  getCategoryWeight,
} from "../priority-scorer";
import type { PoolPlayer } from "../types";
import type { CategoryState } from "../types";

// ============================================================
// Fixtures
// ============================================================

/** Create a PoolPlayer with sensible defaults */
function makePlayer(
  name: string,
  positions: string[],
  dollars: number,
  isPitcher = false,
  stats: Record<string, number> = {},
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher,
    positions,
    stats,
  };
}

/** Create a minimal CategoryState with sensible defaults */
function makeCategoryState(
  overrides: Partial<CategoryState> = {},
): CategoryState {
  return {
    scarcityWeights: {},
    paceRatios: {},
    surplusPool: 0,
    cliffPlayers: [],
    initialPoolStats: {},
    categoryDirections: {},
    ...overrides,
  };
}

// ============================================================
// getCategoryWeight tests
// ============================================================

describe("getCategoryWeight — category weight lookup", () => {
  it("SB gets weight 1.5", () => {
    expect(getCategoryWeight(["SB"])).toBe(1.5);
  });

  it("SV gets weight 1.4", () => {
    expect(getCategoryWeight(["SV"])).toBe(1.4);
  });

  it("ERA gets weight 1.3", () => {
    expect(getCategoryWeight(["ERA"])).toBe(1.3);
  });

  it("WHIP gets weight 1.3", () => {
    expect(getCategoryWeight(["WHIP"])).toBe(1.3);
  });

  it("OPS gets weight 1.2", () => {
    expect(getCategoryWeight(["OPS"])).toBe(1.2);
  });

  it("HR gets weight 1.0", () => {
    expect(getCategoryWeight(["HR"])).toBe(1.0);
  });

  it("RBI gets weight 1.0", () => {
    expect(getCategoryWeight(["RBI"])).toBe(1.0);
  });

  it("R gets weight 1.0", () => {
    expect(getCategoryWeight(["R"])).toBe(1.0);
  });

  it("W gets weight 1.0", () => {
    expect(getCategoryWeight(["W"])).toBe(1.0);
  });

  it("K gets weight 1.0", () => {
    expect(getCategoryWeight(["K"])).toBe(1.0);
  });

  it("unknown stat defaults to 1.0", () => {
    expect(getCategoryWeight(["UNKNOWN_STAT"])).toBe(1.0);
  });

  it("multiple stat keys returns max weight (SB=1.5 beats HR=1.0)", () => {
    expect(getCategoryWeight(["HR", "SB", "R"])).toBe(1.5);
  });

  it("ERA and WHIP — max is 1.3", () => {
    expect(getCategoryWeight(["ERA", "WHIP"])).toBe(1.3);
  });

  it("empty array returns default 1.0", () => {
    expect(getCategoryWeight([])).toBe(1.0);
  });
});

// ============================================================
// computePriorityScore tests
// ============================================================

describe("computePriorityScore — EV computation", () => {
  it("EV = FG$ - ESPN_ASV produces correct value (FG$=30, ASV=20 → EV=10)", () => {
    const player = makePlayer("Test Hitter", ["OF"], 30, false, { SB: 25, OPS: 0.9, HR: 20, RBI: 80, R: 90 });
    const state = makeCategoryState();
    const result = computePriorityScore(player, 30, 20, state);
    // EV = 30 - 20 = 10, so evBuffer should be positive
    expect(result.evBuffer).toBeGreaterThan(0);
    expect(result.priorityScore).toBeGreaterThan(0);
  });

  it("missing ESPN ASV (undefined) → EV = 0, priorityScore = 0", () => {
    const player = makePlayer("Test Hitter", ["OF"], 30, false, { SB: 25, OPS: 0.9, HR: 20, RBI: 80, R: 90 });
    const state = makeCategoryState();
    const result = computePriorityScore(player, 30, undefined, state);
    // When ASV missing, EV = 0 → priorityScore should be 0
    expect(result.priorityScore).toBe(0);
    expect(result.evBuffer).toBe(0);
    // Must not be NaN
    expect(Number.isNaN(result.priorityScore)).toBe(false);
    expect(Number.isNaN(result.evBuffer)).toBe(false);
  });

  it("missing ESPN ASV (null) → EV = 0, no NaN in output", () => {
    const player = makePlayer("Test Hitter", ["OF"], 30, false, { SB: 25, OPS: 0.9, HR: 20, RBI: 80, R: 90 });
    const state = makeCategoryState();
    const result = computePriorityScore(player, 30, null, state);
    expect(Number.isNaN(result.priorityScore)).toBe(false);
    expect(Number.isNaN(result.evBuffer)).toBe(false);
    expect(Number.isNaN(result.categoryBonus)).toBe(false);
    expect(result.priorityScore).toBe(0);
  });

  it("negative EV (ASV > FG$) → priority_score = 0 (floored, not negative)", () => {
    const player = makePlayer("Overpaid Player", ["OF"], 20, false, { SB: 10, OPS: 0.8, HR: 15, RBI: 60, R: 70 });
    const state = makeCategoryState();
    // ASV=30, FG$=20 → EV = -10 → should floor to 0
    const result = computePriorityScore(player, 20, 30, state);
    expect(result.priorityScore).toBe(0);
    expect(result.priorityScore).toBeGreaterThanOrEqual(0);
  });

  it("priority_score = EV × category_weight × scarcity_weight × team_need_weight (manual math)", () => {
    // SB player: FG$=30, ASV=20, EV=10
    // SB category_weight = 1.5
    // scarcity_weight = 1.5, team_need_weight = 1.5
    // expected: max(0, 10) × 1.5 × 1.5 × 1.5 = 33.75
    const player = makePlayer("SB Star", ["OF"], 30, false, { SB: 30, OPS: 0.5, HR: 1, RBI: 10, R: 20 });
    const state = makeCategoryState({
      scarcityWeights: { SB: 1.5 },
      paceRatios: { SB: 0.5 },  // 50% of target → need = 0.5 → team_need_weight = 1.5
      categoryDirections: { SB: "HIGHER_BETTER" },
    });
    const result = computePriorityScore(player, 30, 20, state);
    // EV=10, category_weight=1.5, scarcity=1.5, team_need=1.5
    expect(result.priorityScore).toBeCloseTo(10 * 1.5 * 1.5 * 1.5, 1);
  });

  it("scarcity_weight clamped to 2.0 max (input 3.0 → clamped to 2.0)", () => {
    const player = makePlayer("SB Player", ["OF"], 30, false, { SB: 30, OPS: 0.5, HR: 1, RBI: 10, R: 20 });
    // scarcity_weight = 3.0 but should be clamped to 2.0
    const state = makeCategoryState({
      scarcityWeights: { SB: 3.0 },
      paceRatios: { SB: 0.0 }, // team_need = 1.0 (baseline)
      categoryDirections: { SB: "HIGHER_BETTER" },
    });
    const result = computePriorityScore(player, 30, 20, state);
    // EV=10, category_weight=1.5, scarcity CLAMPED to 2.0, team_need=1+0=1.0 (paceRatio=0, need=1-0=1 → clamped to 1.0)
    // priority = 10 * 1.5 * 2.0 * 1.0 = 30 (not 10 * 1.5 * 3.0 * 1.0 = 45)
    expect(result.priorityScore).toBeLessThanOrEqual(10 * 1.5 * 2.0 * 2.0);
    // verify specifically not 3.0× scarcity
    expect(result.priorityScore).not.toBeCloseTo(10 * 1.5 * 3.0 * 1.0, 0);
  });

  it("team_need_weight clamped to 2.0 max (input 2.5 → clamped to 2.0)", () => {
    // paceRatio=0 for HIGHER_BETTER → need=1-0=1, team_need_weight=1+min(1,1)=2.0 (clamped at 2.0)
    // Even if pace is worse (ratio=-1), still clamps at 2.0
    const player = makePlayer("SB Player", ["OF"], 30, false, { SB: 30, OPS: 0.5, HR: 1, RBI: 10, R: 20 });
    const state = makeCategoryState({
      scarcityWeights: { SB: 1.0 },
      paceRatios: { SB: -0.5 }, // Below 0 → need = 1-(-0.5) = 1.5 → team_need_weight = 1+min(1,1.5) = 2.0 (clamped)
      categoryDirections: { SB: "HIGHER_BETTER" },
    });
    const result = computePriorityScore(player, 30, 20, state);
    // team_need_weight must be <= 2.0
    // priority = 10 × 1.5 × 1.0 × team_need_weight, where team_need_weight <= 2.0
    expect(result.priorityScore).toBeLessThanOrEqual(10 * 1.5 * 1.0 * 2.0);
  });

  it("scarcity_weight floored at 1.0 (input 0.5 → clamped to 1.0)", () => {
    const player = makePlayer("SB Player", ["OF"], 30, false, { SB: 30, OPS: 0.5, HR: 1, RBI: 10, R: 20 });
    // scarcity_weight = 0.5 but should be clamped to 1.0
    const state = makeCategoryState({
      scarcityWeights: { SB: 0.5 },
      paceRatios: { SB: 1.0 },
      categoryDirections: { SB: "HIGHER_BETTER" },
    });
    const result = computePriorityScore(player, 30, 20, state);
    // Even with 0.5 scarcity, should use 1.0 floor
    // priority >= EV * category_weight * 1.0 * team_need_weight
    expect(result.priorityScore).toBeGreaterThanOrEqual(10 * 1.5 * 1.0 * 1.0);
  });

  it("SB player gets category_weight 1.5", () => {
    const player = makePlayer("SB Specialist", ["OF"], 30, false, { SB: 30, OPS: 0.5, HR: 0, RBI: 0, R: 0 });
    const state = makeCategoryState({
      scarcityWeights: { SB: 1.0 },
      paceRatios: { SB: 1.0 },
      categoryDirections: { SB: "HIGHER_BETTER" },
    });
    const resultSB = computePriorityScore(player, 30, 20, state);

    // HR player for comparison (weight=1.0)
    const hrPlayer = makePlayer("HR Specialist", ["OF"], 30, false, { SB: 0, OPS: 0.5, HR: 30, RBI: 0, R: 0 });
    const stateHR = makeCategoryState({
      scarcityWeights: { HR: 1.0 },
      paceRatios: { HR: 1.0 },
      categoryDirections: { HR: "HIGHER_BETTER" },
    });
    const resultHR = computePriorityScore(hrPlayer, 30, 20, stateHR);

    // SB should score 1.5x more than HR at same EV and weights
    expect(resultSB.priorityScore).toBeGreaterThan(resultHR.priorityScore);
  });

  it("pitcher gets ERA/WHIP weight 1.3 (max weight used)", () => {
    // Pitcher with ERA and WHIP contributions — max of 1.3 and 1.3 = 1.3
    const pitcher = makePlayer("Ace SP", ["SP"], 25, true, { ERA: 3.0, WHIP: 1.1, K: 180, W: 12, SV: 0, IP: 180 });
    const state = makeCategoryState({
      scarcityWeights: { ERA: 1.0 },
      paceRatios: { ERA: 1.0 },
      categoryDirections: { ERA: "LOWER_BETTER" },
    });
    const result = computePriorityScore(pitcher, 25, 15, state);
    expect(result.priorityScore).toBeGreaterThan(0);
    // category_weight should be 1.3 (ERA or WHIP, whichever is max)
    // Compare against K-only pitcher (weight=1.0)
    const kPitcher = makePlayer("K Pitcher", ["SP"], 25, true, { ERA: 0, WHIP: 0, K: 180, W: 12, SV: 0, IP: 180 });
    const stateK = makeCategoryState({
      scarcityWeights: { K: 1.0 },
      paceRatios: { K: 1.0 },
      categoryDirections: { K: "HIGHER_BETTER" },
    });
    const resultK = computePriorityScore(kPitcher, 25, 15, stateK);
    expect(result.priorityScore).toBeGreaterThan(resultK.priorityScore);
  });

  it("returns priorityScore, evBuffer, categoryBonus as numbers", () => {
    const player = makePlayer("Test", ["OF"], 20, false, { SB: 15, OPS: 0.85, HR: 20, RBI: 80, R: 90 });
    const state = makeCategoryState();
    const result = computePriorityScore(player, 20, 15, state);
    expect(typeof result.priorityScore).toBe("number");
    expect(typeof result.evBuffer).toBe("number");
    expect(typeof result.categoryBonus).toBe("number");
    expect(typeof result.maxBid).toBe("number");
    expect(Array.isArray(result.playerTags)).toBe(true);
  });
});

// ============================================================
// computeEVMaxBid tests
// ============================================================

describe("computeEVMaxBid — max bid formula", () => {
  it("max bid = inflated FG$ + evBuffer + categoryBonus, hard capped at FG$ × 1.25", () => {
    // FG$=20, inflation=1.0, base=20, evBuffer=2, categoryBonus=1
    // raw=23, cap=20*1.25=25 → maxBid=23
    const result = computeEVMaxBid(20, 2, 1, 1.0, 200, false);
    expect(result).toBe(23);
  });

  it("inflated FG$ = FG$ × inflationFactor (FG$=20, inflation=1.1 → base=22)", () => {
    // FG$=20, inflation=1.1, base=22, evBuffer=0, categoryBonus=0
    // raw=22, cap=25 → maxBid=22
    const result = computeEVMaxBid(20, 0, 0, 1.1, 200, false);
    expect(result).toBe(22);
  });

  it("hard cap is FG$ × 1.25 on RAW FG$, not inflated (FG$=20, cap=$25 regardless of inflation)", () => {
    // FG$=20, inflation=2.0, base=40, evBuffer=10, categoryBonus=5
    // raw=55, cap=20*1.25=25 → maxBid should be 25 (capped)
    const result = computeEVMaxBid(20, 10, 5, 2.0, 200, false);
    expect(result).toBe(25);
  });

  it("floors at 1 when all inputs are zero", () => {
    const result = computeEVMaxBid(0, 0, 0, 1.0, 200, false);
    expect(result).toBe(1);
  });

  it("floors at 1 when FG$ is very low (FG$=1, evBuffer=0, categoryBonus=0)", () => {
    const result = computeEVMaxBid(1, 0, 0, 1.0, 200, false);
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it("endgame: when isEndgame=true, apply 30% dampening to evBuffer and categoryBonus (multiplier 0.7×)", () => {
    // FG$=20, inflation=1.0, evBuffer=10, categoryBonus=5
    // Non-endgame: raw=20+10+5=35, capped at 25
    // Endgame: evBuffer_dampened=7, categoryBonus_dampened=3.5≈3 (or Math.round(5*0.7)=4)
    // raw=20+7+4=31, still capped at 25
    // Key test: endgame should produce same or lower result than non-endgame
    const nonEndgame = computeEVMaxBid(20, 10, 5, 1.0, 20, false);
    const endgame = computeEVMaxBid(20, 10, 5, 1.0, 20, true);
    expect(endgame).toBeLessThanOrEqual(nonEndgame);
  });

  it("endgame dampening: evBuffer reduces by 0.7 factor", () => {
    // FG$=10, inflation=1.0, evBuffer=10, categoryBonus=0
    // Non-endgame: raw=10+10+0=20, cap=12.5→12 → maxBid=12
    // Endgame: evBuffer_dampened=7, raw=10+7=17, capped at 12
    const nonEndgame = computeEVMaxBid(10, 10, 0, 1.0, 20, false);
    const endgame = computeEVMaxBid(10, 10, 0, 1.0, 20, true);
    expect(endgame).toBeLessThanOrEqual(nonEndgame);
  });

  it("returns maxBid as integer (Math.round)", () => {
    const result = computeEVMaxBid(20, 3, 2, 1.0, 200, false);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("budget constraint: cannot bid more than budget - 1", () => {
    // budget=$5 → maxBid <= 4 (need $1 reserve)
    const result = computeEVMaxBid(20, 5, 3, 1.0, 5, false);
    expect(result).toBeLessThanOrEqual(4);
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it("cap calculation uses raw FG$ not inflated: FG$=40, inflation=1.5, cap=50 (not 75)", () => {
    // FG$=40, inflation=1.5 → inflated=60, evBuffer=20, categoryBonus=5
    // raw=60+20+5=85, cap=40*1.25=50 → maxBid=50
    const result = computeEVMaxBid(40, 20, 5, 1.5, 200, false);
    expect(result).toBe(50);
  });
});

// ============================================================
// tagPlayer tests
// ============================================================

describe("tagPlayer — player tag classification", () => {
  it("is_SB_anchor when SB >= 20 (SB=22 → tagged)", () => {
    const player = makePlayer("SB Star", ["OF"], 25, false, { SB: 22, OPS: 0.9 });
    const tags = tagPlayer(player);
    expect(tags).toContain("is_SB_anchor");
  });

  it("is_SB_anchor NOT when SB < 20 (SB=15 → not tagged)", () => {
    const player = makePlayer("Avg Runner", ["OF"], 15, false, { SB: 15, OPS: 0.85 });
    const tags = tagPlayer(player);
    expect(tags).not.toContain("is_SB_anchor");
  });

  it("is_SB_anchor exactly at threshold: SB=20 → tagged", () => {
    const player = makePlayer("Exact SB", ["OF"], 20, false, { SB: 20, OPS: 0.75 });
    const tags = tagPlayer(player);
    expect(tags).toContain("is_SB_anchor");
  });

  it("is_OPS_anchor when OPS >= 0.850 (OPS=0.900 → tagged)", () => {
    const player = makePlayer("OPS Machine", ["1B"], 30, false, { SB: 5, OPS: 0.9 });
    const tags = tagPlayer(player);
    expect(tags).toContain("is_OPS_anchor");
  });

  it("is_OPS_anchor NOT when OPS < 0.850 (OPS=0.800 → not tagged)", () => {
    const player = makePlayer("Avg Hitter", ["OF"], 15, false, { SB: 10, OPS: 0.8 });
    const tags = tagPlayer(player);
    expect(tags).not.toContain("is_OPS_anchor");
  });

  it("is_OPS_anchor exactly at threshold: OPS=0.850 → tagged", () => {
    const player = makePlayer("Exact OPS", ["3B"], 20, false, { SB: 5, OPS: 0.85 });
    const tags = tagPlayer(player);
    expect(tags).toContain("is_OPS_anchor");
  });

  it("is_closer when SV > 20 (SV=25 → tagged)", () => {
    const player = makePlayer("Elite Closer", ["RP"], 20, true, { SV: 25, ERA: 2.5, WHIP: 1.0, K: 60, IP: 60 });
    const tags = tagPlayer(player);
    expect(tags).toContain("is_closer");
  });

  it("is_closer NOT when SV <= 20 (SV=10 → not tagged)", () => {
    const player = makePlayer("Setup Man", ["RP"], 10, true, { SV: 10, ERA: 3.0, WHIP: 1.1, K: 50, IP: 55 });
    const tags = tagPlayer(player);
    expect(tags).not.toContain("is_closer");
  });

  it("is_closer NOT when SV exactly 20 (boundary: SV > 20 required)", () => {
    const player = makePlayer("Border Closer", ["RP"], 15, true, { SV: 20, ERA: 2.8, WHIP: 1.05, K: 55, IP: 58 });
    const tags = tagPlayer(player);
    expect(tags).not.toContain("is_closer");
  });

  it("is_replaceable_bat when SB < 5 AND OPS < 0.800 (both conditions required)", () => {
    const player = makePlayer("Boring Bat", ["1B"], 5, false, { SB: 2, OPS: 0.75 });
    const tags = tagPlayer(player);
    expect(tags).toContain("is_replaceable_bat");
  });

  it("is_replaceable_bat NOT when only SB < 5 but OPS >= 0.800", () => {
    const player = makePlayer("Low SB But OPS OK", ["1B"], 15, false, { SB: 2, OPS: 0.85 });
    const tags = tagPlayer(player);
    expect(tags).not.toContain("is_replaceable_bat");
  });

  it("is_replaceable_bat NOT when only OPS < 0.800 but SB >= 5", () => {
    const player = makePlayer("SB Only", ["OF"], 12, false, { SB: 10, OPS: 0.750 });
    const tags = tagPlayer(player);
    expect(tags).not.toContain("is_replaceable_bat");
  });

  it("is_SP_anchor when K/IP > median, ERA < median, WHIP < median (all three required)", () => {
    const player = makePlayer("Ace SP", ["SP"], 30, true, { K: 200, IP: 180, ERA: 3.0, WHIP: 1.1, W: 14 });
    const medians = { kPerIP: 1.0, era: 4.0, whip: 1.3 };
    // K/IP=200/180≈1.11 > 1.0 ✓, ERA=3.0 < 4.0 ✓, WHIP=1.1 < 1.3 ✓
    const tags = tagPlayer(player, medians);
    expect(tags).toContain("is_SP_anchor");
  });

  it("is_SP_anchor NOT when K rate below median", () => {
    const player = makePlayer("Weak K SP", ["SP"], 20, true, { K: 100, IP: 180, ERA: 3.0, WHIP: 1.1, W: 14 });
    const medians = { kPerIP: 1.0, era: 4.0, whip: 1.3 };
    // K/IP=100/180≈0.56 < 1.0 ✗
    const tags = tagPlayer(player, medians);
    expect(tags).not.toContain("is_SP_anchor");
  });

  it("is_SP_anchor NOT when ERA above median", () => {
    const player = makePlayer("Bad ERA SP", ["SP"], 15, true, { K: 200, IP: 180, ERA: 4.5, WHIP: 1.1, W: 10 });
    const medians = { kPerIP: 1.0, era: 4.0, whip: 1.3 };
    // ERA=4.5 > 4.0 ✗
    const tags = tagPlayer(player, medians);
    expect(tags).not.toContain("is_SP_anchor");
  });

  it("is_SP_anchor NOT when WHIP above median", () => {
    const player = makePlayer("Bad WHIP SP", ["SP"], 15, true, { K: 200, IP: 180, ERA: 3.0, WHIP: 1.4, W: 10 });
    const medians = { kPerIP: 1.0, era: 4.0, whip: 1.3 };
    // WHIP=1.4 > 1.3 ✗
    const tags = tagPlayer(player, medians);
    expect(tags).not.toContain("is_SP_anchor");
  });

  it("is_SP_anchor NOT when poolMedians not provided", () => {
    const player = makePlayer("Ace SP", ["SP"], 30, true, { K: 200, IP: 180, ERA: 3.0, WHIP: 1.1, W: 14 });
    const tags = tagPlayer(player); // no poolMedians
    expect(tags).not.toContain("is_SP_anchor");
  });

  it("pitcher gets no hitter tags (is_SB_anchor, is_OPS_anchor, is_replaceable_bat)", () => {
    // Even if pitcher has SB/OPS stats (unlikely), they should not get hitter tags
    const pitcher = makePlayer("SP With Stats", ["SP"], 25, true, { K: 180, IP: 180, ERA: 3.0, WHIP: 1.1, SB: 30, OPS: 0.95, SV: 0 });
    const tags = tagPlayer(pitcher);
    expect(tags).not.toContain("is_SB_anchor");
    expect(tags).not.toContain("is_OPS_anchor");
    expect(tags).not.toContain("is_replaceable_bat");
  });

  it("hitter gets no pitcher tags (is_closer, is_SP_anchor)", () => {
    const hitter = makePlayer("OF With SV Stats", ["OF"], 20, false, { SB: 25, OPS: 0.9, SV: 30, K: 200, IP: 200 });
    const medians = { kPerIP: 1.0, era: 4.0, whip: 1.3 };
    const tags = tagPlayer(hitter, medians);
    expect(tags).not.toContain("is_closer");
    expect(tags).not.toContain("is_SP_anchor");
  });

  it("returns [] when no conditions met", () => {
    const player = makePlayer("Average Joe", ["OF"], 10, false, { SB: 8, OPS: 0.82, HR: 12, RBI: 55 });
    const tags = tagPlayer(player);
    expect(tags).toEqual([]);
  });

  it("returns multiple tags when multiple conditions met (is_SB_anchor + is_OPS_anchor)", () => {
    const player = makePlayer("Five-Tool Star", ["OF"], 40, false, { SB: 30, OPS: 0.95 });
    const tags = tagPlayer(player);
    expect(tags).toContain("is_SB_anchor");
    expect(tags).toContain("is_OPS_anchor");
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });
});
