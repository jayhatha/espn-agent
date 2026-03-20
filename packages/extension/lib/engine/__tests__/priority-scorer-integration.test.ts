/**
 * priority-scorer-integration.test.ts
 *
 * Integration tests for Phase 62 EV-based priority scoring pipeline.
 *
 * Covers: end-to-end priority score flow, hard cap enforcement, negative EV,
 * force acquisition, strategy cap regression, surplus pool, cliff detection,
 * endgame dampening, and backward compat for computeMaxBid.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { computePriorityScore, computeEVMaxBid, tagPlayer } from "../priority-scorer";
import { computeCategoryState, resetCategoryStateCache } from "../category-state";
import { computeMaxBid } from "../bid-optimizer";
import { computeStrategyBidCap } from "../strategy-caps";
import type { PoolPlayer, CategoryState } from "../types";
import type { OpponentModel } from "../types";

// ============================================================
// Fixtures
// ============================================================

function makePlayer(
  name: string,
  isPitcher: boolean,
  stats: Record<string, number>,
  dollars = 20,
  positions?: string[],
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase().replace(/\s+/g, " "),
    dollars,
    isPitcher,
    positions: positions ?? (isPitcher ? ["SP"] : ["OF"]),
    stats,
  };
}

function makeCategoryState(overrides: Partial<CategoryState> = {}): CategoryState {
  return {
    scarcityWeights: {},
    paceRatios: {},
    surplusPool: 0,
    cliffPlayers: [],
    initialPoolStats: {},
    categoryDirections: {},
    forceAcquisitionCategories: [],
    ...overrides,
  };
}

function makeOpponentModel(): OpponentModel {
  return {
    teamNeeds: new Map(),
    teamBudgets: new Map(),
    competitionFactors: {},
    leagueInflationFactor: 1.0,
  };
}

// ============================================================
// Tests
// ============================================================

describe("priority-scorer-integration", () => {
  beforeEach(() => {
    resetCategoryStateCache();
  });

  describe("1. End-to-end priority score flow", () => {
    it("computes priorityScore > 0 and evBuffer, tags is_SB_anchor, and maxBid <= FG$ x 1.25", () => {
      const player = makePlayer("mike trout", false, { SB: 25, OPS: 0.9, HR: 20, R: 90, RBI: 80 }, 30);

      const categoryState = makeCategoryState({
        scarcityWeights: { SB: 1.6 },
        paceRatios: { SB: 0.70 },
        categoryDirections: { SB: "HIGHER_BETTER" },
      });

      const result = computePriorityScore(player, 30, 22, categoryState);

      // EV = 30 - 22 = 8
      expect(result.evBuffer).toBe(Math.round(8 * 0.3)); // 2

      // priority_score = max(0,8) × categoryWeight(SB=1.5) × scarcity(1.6) × teamNeed
      // teamNeed = 1 + min(1, max(0, 1 - 0.70)) = 1 + 0.30 = 1.30
      expect(result.priorityScore).toBeGreaterThan(0);

      // Player has SB=25 → is_SB_anchor
      expect(result.playerTags).toContain("is_SB_anchor");

      // maxBid via computeEVMaxBid: hard cap at FG$ × 1.25 = 37.50 → 37
      const evMaxBid = computeEVMaxBid(30, result.evBuffer, result.categoryBonus, 1.0, 260, false);
      expect(evMaxBid).toBeLessThanOrEqual(37);
    });
  });

  describe("2. Hard cap enforcement", () => {
    it("maxBid is capped at FG$ x 1.25 even with large evBuffer and categoryBonus", () => {
      const player = makePlayer("big hitter", false, { SB: 30, OPS: 1.0, HR: 50, R: 100, RBI: 120 }, 40);

      const categoryState = makeCategoryState({
        scarcityWeights: { SB: 2.0 },
        paceRatios: { SB: 0.0 },
        categoryDirections: { SB: "HIGHER_BETTER" },
      });

      const result = computePriorityScore(player, 40, 10, categoryState);

      // With inflation 1.5 and large buffers, cap is still 40 × 1.25 = 50
      const maxBid = computeEVMaxBid(40, result.evBuffer, result.categoryBonus, 1.5, 260, false);
      expect(maxBid).toBeLessThanOrEqual(50);
    });
  });

  describe("3. Negative EV does not produce negative maxBid", () => {
    it("returns maxBid >= 1 when FG$ < ESPN ASV (negative EV)", () => {
      const player = makePlayer("cheap hitter", false, { SB: 5, OPS: 0.75, HR: 10, R: 50, RBI: 40 }, 20);

      const categoryState = makeCategoryState();

      // FG$=20, ESPN ASV=$30 → EV=-10 → priorityScore=0, evBuffer=0
      const result = computePriorityScore(player, 20, 30, categoryState);

      expect(result.priorityScore).toBe(0);
      expect(result.evBuffer).toBe(0);

      // maxBid with inflation=1.0, budget=260 should be at least 1
      const maxBid = computeEVMaxBid(20, result.evBuffer, result.categoryBonus, 1.0, 260, false);
      expect(maxBid).toBeGreaterThanOrEqual(1);
    });
  });

  describe("4. Force acquisition category state", () => {
    it("flags SB in forceAcquisitionCategories when pace < 0.80 after 20% of draft", () => {
      const players: PoolPlayer[] = [
        makePlayer("player a", false, { SB: 30, OPS: 0.9, HR: 20, R: 80, RBI: 70 }, 35),
        makePlayer("player b", false, { SB: 10, OPS: 0.8, HR: 15, R: 60, RBI: 50 }, 20),
        makePlayer("player c", false, { SB: 5, OPS: 0.7, HR: 5, R: 40, RBI: 30 }, 8),
      ];

      const state = computeCategoryState({
        leagueId: 1,
        undraftedPlayers: players,
        allUndraftedPlusDrafted: players,
        myDraftedPlayers: [],
        myTotals: { SB: 15 },           // pace = 15/40 = 0.375 < 0.80
        categoryTargets: { SB: 40 },
        categoryDirections: { SB: "HIGHER_BETTER" },
        totalPicksMade: 50,             // 50/200 = 25% > 20% threshold
        totalPicksInDraft: 200,
      });

      expect(state.forceAcquisitionCategories).toContain("SB");
    });
  });

  describe("5. Strategy caps still apply on top of EV-based maxBid", () => {
    it("RP bid capped at $15 even when EV-based maxBid exceeds RP limit", () => {
      // EV-based maxBid = $25 for an RP
      const cappedResult = computeStrategyBidCap({
        rawMaxBid: 25,
        isPitcher: true,
        isSP: false,
        positions: ["RP"],
        primaryPosition: "RP",
        spCount: 3,
        catcherSlotsRemaining: 1,
        isEndgame: false,
        inflationFactor: 1.0,
        hitterSpent: 100,
        pitcherSpent: 50,
        remainingSlots: { P: 6, BN: 3 },
        externalRank: undefined,
      });

      // RP max is $15
      expect(cappedResult.bidCap).toBeLessThanOrEqual(15);
    });
  });

  describe("6. computeMaxBid backward compat", () => {
    it("computeMaxBid is still importable and returns maxBid > 0", () => {
      const player = makePlayer("reliable hitter", false, { SB: 10, OPS: 0.85, HR: 25, R: 80, RBI: 85 }, 25);
      const pool: PoolPlayer[] = [
        player,
        makePlayer("second hitter", false, { SB: 5, OPS: 0.8, HR: 15, R: 60, RBI: 60 }, 18),
        makePlayer("third hitter", false, { SB: 3, OPS: 0.75, HR: 10, R: 50, RBI: 45 }, 12),
      ];
      const sgpValues = pool.map(p => p.dollars * 0.1);
      const rosterSlots: Record<string, number> = { OF: 4, UTIL: 3, BN: 3 };
      const opponentModel = makeOpponentModel();

      const result = computeMaxBid(player, pool, sgpValues, 260, rosterSlots, opponentModel, 1.0, 20);
      expect(result.maxBid).toBeGreaterThan(0);
    });
  });

  describe("8. Surplus pool accumulates correctly", () => {
    it("surplus = sum of max(0, fgDollars - paidDollars) for each player", () => {
      const state = computeCategoryState({
        leagueId: 2,
        undraftedPlayers: [],
        allUndraftedPlusDrafted: [],
        myDraftedPlayers: [
          { normalizedName: "a", fgDollars: 30, paidDollars: 22 }, // surplus = 8
          { normalizedName: "b", fgDollars: 15, paidDollars: 20 }, // overpay = no surplus
        ],
        myTotals: {},
        categoryTargets: {},
        categoryDirections: {},
        totalPicksMade: 10,
        totalPicksInDraft: 200,
      });

      expect(state.surplusPool).toBe(8);
    });
  });

  describe("9. Cliff detection flags correct player", () => {
    it("top SB contributor is in cliffPlayers when FG$ dropoff > $5 to second contributor", () => {
      const playerA = makePlayer("speedster a", false, { SB: 30, OPS: 0.85, HR: 5, R: 70, RBI: 50 }, 40);
      const playerB = makePlayer("speedster b", false, { SB: 22, OPS: 0.78, HR: 3, R: 55, RBI: 40 }, 28);
      const playerC = makePlayer("average runner c", false, { SB: 15, OPS: 0.72, HR: 2, R: 45, RBI: 30 }, 15);

      const state = computeCategoryState({
        leagueId: 3,
        undraftedPlayers: [playerA, playerB, playerC],
        allUndraftedPlusDrafted: [playerA, playerB, playerC],
        myDraftedPlayers: [],
        myTotals: {},
        categoryTargets: {},
        categoryDirections: { SB: "HIGHER_BETTER" },
        totalPicksMade: 5,
        totalPicksInDraft: 200,
      });

      // Sorted by SB: A(30), B(22), C(15)
      // A.dollars=40, B.dollars=28 → dropoff=12 > 5 → A in cliffPlayers
      expect(state.cliffPlayers).toContain(playerA.normalizedName);
    });
  });

  describe("10. Endgame dampening reduces evBuffer", () => {
    it("endgame dampening applies 0.7x to evBuffer when budget <= $20", () => {
      const player = makePlayer("endgame hitter", false, { SB: 10, OPS: 0.85, HR: 20, R: 70, RBI: 65 }, 20);
      const categoryState = makeCategoryState();

      // EV = 20 - 0 (no ASV) = 0; use manual evBuffer for comparison
      // Simulate evBuffer=$6 at budget=$100 (not endgame)
      const bidAtFullBudget = computeEVMaxBid(20, 6, 0, 1.0, 100, false);
      // base=20, evBuffer=6 → raw=26, cap=25 (20×1.25), budget ceiling=99 → min(26,25,99)=25
      expect(bidAtFullBudget).toBe(25);

      // At endgame: evBuffer dampened to round(6×0.7)=4 → raw=24, cap=25 → min(24,25,19)=19
      const bidAtEndgame = computeEVMaxBid(20, 6, 0, 1.0, 20, true);
      // base=20, dampened_evBuffer=round(6*0.7)=4 → raw=24, cap=25, budget ceiling=19 → 19
      expect(bidAtEndgame).toBeLessThan(bidAtFullBudget);
    });
  });

  describe("tagPlayer", () => {
    it("tags is_closer for pitcher with SV > 20", () => {
      const closer = makePlayer("closer x", true, { SV: 35, ERA: 2.5, WHIP: 0.95, K: 70, IP: 60 }, 22);
      const tags = tagPlayer(closer);
      expect(tags).toContain("is_closer");
    });

    it("tags is_OPS_anchor for hitter with OPS >= 0.850", () => {
      const hitter = makePlayer("slugger y", false, { OPS: 0.92, HR: 35, SB: 3, R: 90, RBI: 100 }, 40);
      const tags = tagPlayer(hitter);
      expect(tags).toContain("is_OPS_anchor");
    });

    it("tags is_replaceable_bat for hitter with low SB and OPS", () => {
      const bench = makePlayer("bench bat", false, { SB: 2, OPS: 0.72, HR: 8, R: 40, RBI: 35 }, 5);
      const tags = tagPlayer(bench);
      expect(tags).toContain("is_replaceable_bat");
    });
  });
});
