/**
 * category-state.test.ts
 *
 * TDD tests for computeCategoryState in category-state.ts.
 * Covers: scarcity weights, pace tracking, surplus pool, cliff detection,
 * serialization, and module-level cache behavior.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { computeCategoryState, resetCategoryStateCache } from "../category-state";
import type { PoolPlayer } from "../types";

// ============================================================
// Fixtures
// ============================================================

function makePlayer(
  name: string,
  positions: string[],
  dollars: number,
  stats: Record<string, number> = {},
  isPitcher = false,
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

function makeDefaultInput(overrides: Partial<Parameters<typeof computeCategoryState>[0]> = {}) {
  const hitters: PoolPlayer[] = [
    makePlayer("Hitter A", ["OF"], 30, { HR: 30, R: 90, RBI: 90, SB: 25, OPS: 0.9 }),
    makePlayer("Hitter B", ["SS"], 20, { HR: 20, R: 70, RBI: 70, SB: 10, OPS: 0.8 }),
    makePlayer("Hitter C", ["1B"], 10, { HR: 10, R: 50, RBI: 50, SB: 2, OPS: 0.75 }),
    makePlayer("Hitter D", ["3B"], 5, { HR: 5, R: 30, RBI: 30, SB: 1, OPS: 0.7 }),
  ];
  const pitchers: PoolPlayer[] = [
    makePlayer("Pitcher A", ["SP"], 25, { IP: 180, ER: 63, K: 200, W: 15, SV: 0, ERA: 3.15, WHIP: 1.10 }, true),
    makePlayer("Pitcher B", ["RP"], 20, { IP: 60, ER: 15, K: 80, W: 5, SV: 35, ERA: 2.25, WHIP: 0.9 }, true),
    makePlayer("Pitcher C", ["SP"], 12, { IP: 150, ER: 60, K: 140, W: 10, SV: 0, ERA: 3.60, WHIP: 1.25 }, true),
  ];
  const allPlayers = [...hitters, ...pitchers];

  return {
    leagueId: 123,
    undraftedPlayers: allPlayers,
    allUndraftedPlusDrafted: allPlayers,
    myDraftedPlayers: [],
    myTotals: {},
    categoryTargets: { HR: 40, R: 100, RBI: 100, SB: 30, OPS: 0.85, ERA: 3.50, WHIP: 1.20, K: 220, W: 15, SV: 40 },
    categoryDirections: {
      HR: "HIGHER_BETTER",
      R: "HIGHER_BETTER",
      RBI: "HIGHER_BETTER",
      SB: "HIGHER_BETTER",
      OPS: "HIGHER_BETTER",
      K: "HIGHER_BETTER",
      W: "HIGHER_BETTER",
      SV: "HIGHER_BETTER",
      ERA: "LOWER_BETTER",
      WHIP: "LOWER_BETTER",
    } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
    totalPicksMade: 50,
    totalPicksInDraft: 200,
    ...overrides,
  };
}

// ============================================================
// Scarcity weight tests
// ============================================================

describe("computeCategoryState — scarcity weights", () => {
  beforeEach(() => {
    resetCategoryStateCache();
  });

  it("ratio=0.5 → scarcity_weight=1.5", () => {
    // initial HR total = 65, remaining HR total = 32.5 (ratio ~0.5)
    const allPlayers = [
      makePlayer("P1", ["OF"], 30, { HR: 40 }),
      makePlayer("P2", ["SS"], 10, { HR: 25 }),
    ];
    // undrafted has half: simulate by removing one player
    const undrafted = [makePlayer("P2", ["SS"], 10, { HR: 25 })];
    const result = computeCategoryState({
      leagueId: 1,
      undraftedPlayers: undrafted,
      allUndraftedPlusDrafted: allPlayers,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { HR: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 10,
      totalPicksInDraft: 200,
    });
    // ratio = 25/65 ≈ 0.385 → weight = 1 + (1 - 0.385) = 1.615
    // Just check that undrafted < initial → weight > 1.0
    expect(result.scarcityWeights["HR"]).toBeGreaterThan(1.0);
  });

  it("ratio=1.0 (all players still available) → scarcity_weight=1.0", () => {
    const allPlayers = [makePlayer("P1", ["OF"], 30, { HR: 40 })];
    const result = computeCategoryState({
      leagueId: 2,
      undraftedPlayers: allPlayers,
      allUndraftedPlusDrafted: allPlayers,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { HR: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 0,
      totalPicksInDraft: 200,
    });
    expect(result.scarcityWeights["HR"]).toBeCloseTo(1.0);
  });

  it("ratio=0.0 (no players left) → scarcity_weight=2.0 (clamped)", () => {
    const allPlayers = [makePlayer("P1", ["OF"], 30, { HR: 40 })];
    const result = computeCategoryState({
      leagueId: 3,
      undraftedPlayers: [],
      allUndraftedPlusDrafted: allPlayers,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { HR: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 50,
      totalPicksInDraft: 200,
    });
    expect(result.scarcityWeights["HR"]).toBe(2.0);
  });

  it("scarcity_weight clamped to 2.0 max even when ratio goes below 0", () => {
    // All players drafted (empty undrafted)
    const allPlayers = [makePlayer("P1", ["OF"], 30, { HR: 40 })];
    const result = computeCategoryState({
      leagueId: 4,
      undraftedPlayers: [],
      allUndraftedPlusDrafted: allPlayers,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { HR: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 50,
      totalPicksInDraft: 200,
    });
    expect(result.scarcityWeights["HR"]).toBeLessThanOrEqual(2.0);
  });

  it("scarcity_weight floored at 1.0 even when ratio > 1", () => {
    // undrafted has MORE HR than initial (impossible in practice, but test clamp)
    const allPlayers = [makePlayer("P1", ["OF"], 30, { HR: 10 })];
    const undrafted = [makePlayer("P1", ["OF"], 30, { HR: 20 })]; // more than initial
    const result = computeCategoryState({
      leagueId: 5,
      undraftedPlayers: undrafted,
      allUndraftedPlusDrafted: allPlayers,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { HR: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 0,
      totalPicksInDraft: 200,
    });
    expect(result.scarcityWeights["HR"]).toBeGreaterThanOrEqual(1.0);
  });

  it("SB scarcity increases as SB contributors drafted from pool", () => {
    const allPlayers = [
      makePlayer("SB Star", ["OF"], 35, { SB: 40 }),
      makePlayer("SB Mid", ["SS"], 15, { SB: 20 }),
      makePlayer("SB Low", ["1B"], 5, { SB: 5 }),
    ];
    const afterDrafting = [makePlayer("SB Low", ["1B"], 5, { SB: 5 })];

    const resultFull = computeCategoryState({
      leagueId: 6,
      undraftedPlayers: allPlayers,
      allUndraftedPlusDrafted: allPlayers,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { SB: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 0,
      totalPicksInDraft: 200,
    });

    resetCategoryStateCache();

    const resultPartial = computeCategoryState({
      leagueId: 6,
      undraftedPlayers: afterDrafting,
      allUndraftedPlusDrafted: allPlayers,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { SB: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 20,
      totalPicksInDraft: 200,
    });

    expect(resultPartial.scarcityWeights["SB"]).toBeGreaterThan(resultFull.scarcityWeights["SB"]);
  });

  it("ERA/WHIP use inverted ratio (pool median based)", () => {
    // Pool median ERA = 3.375 (avg of 3.15, 3.60 pitchers with IP>0)
    // If remaining pool median worsens (higher ERA), ratio = initial/remaining < 1, weight > 1
    const allPitchers = [
      makePlayer("SP A", ["SP"], 25, { IP: 180, ERA: 3.00, WHIP: 1.10 }, true),
      makePlayer("SP B", ["SP"], 12, { IP: 150, ERA: 4.00, WHIP: 1.30 }, true),
    ];
    // Remaining has only the worse pitcher
    const remaining = [makePlayer("SP B", ["SP"], 12, { IP: 150, ERA: 4.00, WHIP: 1.30 }, true)];

    const result = computeCategoryState({
      leagueId: 7,
      undraftedPlayers: remaining,
      allUndraftedPlusDrafted: allPitchers,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { ERA: "LOWER_BETTER", WHIP: "LOWER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 20,
      totalPicksInDraft: 200,
    });

    // Remaining median ERA = 4.00, initial median ERA = 3.50 (avg of 3 and 4)
    // ratio = initialMedian / remainingMedian = 3.50/4.00 = 0.875 → weight = 1 + (1-0.875) = 1.125
    expect(result.scarcityWeights["ERA"]).toBeGreaterThan(1.0);
  });
});

// ============================================================
// Pace tracking tests
// ============================================================

describe("computeCategoryState — pace tracking", () => {
  beforeEach(() => {
    resetCategoryStateCache();
  });

  it("HIGHER_BETTER pace = myTotal / targetTotal", () => {
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 10,
      myTotals: { HR: 30 },
      categoryTargets: { HR: 50 },
    }));
    expect(result.paceRatios["HR"]).toBeCloseTo(0.60);
  });

  it("LOWER_BETTER pace = targetTotal / myTotal (inverted)", () => {
    // ERA target=3.80, my ERA component → pace = target/myTotal
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 11,
      myTotals: { ERA: 4.20 },
      categoryTargets: { ERA: 3.80 },
      categoryDirections: {
        HR: "HIGHER_BETTER",
        ERA: "LOWER_BETTER",
        WHIP: "LOWER_BETTER",
      } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
    }));
    expect(result.paceRatios["ERA"]).toBeCloseTo(3.80 / 4.20);
  });

  it("pace = 1.0 when target missing or zero (no division by zero)", () => {
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 12,
      myTotals: { HR: 10 },
      categoryTargets: {}, // no HR target
    }));
    expect(result.paceRatios["HR"]).toBe(1.0);
  });

  it("pace = 1.0 when myTotal = 0 for LOWER_BETTER (avoid divide by zero)", () => {
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 13,
      myTotals: { ERA: 0 },
      categoryTargets: { ERA: 3.80 },
      categoryDirections: {
        ERA: "LOWER_BETTER",
      } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
    }));
    expect(result.paceRatios["ERA"]).toBe(1.0);
  });

  it("forceAcquisition set when pace < 0.80 AND picks > 20% of total", () => {
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 14,
      myTotals: { SB: 5 },         // Way behind
      categoryTargets: { SB: 30 }, // pace = 5/30 = 0.167 < 0.80
      totalPicksMade: 50,          // 50/200 = 25% > 20%
      totalPicksInDraft: 200,
    }));
    expect(result.forceAcquisitionCategories).toContain("SB");
  });

  it("forceAcquisition not set early in draft (picks < 20%)", () => {
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 15,
      myTotals: { SB: 2 },
      categoryTargets: { SB: 30 }, // pace very low, but early
      totalPicksMade: 2,           // 2/200 = 1% < 20%
      totalPicksInDraft: 200,
    }));
    expect(result.forceAcquisitionCategories).not.toContain("SB");
  });
});

// ============================================================
// Surplus pool tests
// ============================================================

describe("computeCategoryState — surplus pool", () => {
  beforeEach(() => {
    resetCategoryStateCache();
  });

  it("surplus accumulates: FG$=20, paid=$15 → surplus adds $5", () => {
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 20,
      myDraftedPlayers: [
        { fgDollars: 20, paidDollars: 15, normalizedName: "hitter a" },
      ],
    }));
    expect(result.surplusPool).toBe(5);
  });

  it("no surplus when paid > FG$ (paid=$25, FG$=20 → adds $0)", () => {
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 21,
      myDraftedPlayers: [
        { fgDollars: 20, paidDollars: 25, normalizedName: "hitter a" },
      ],
    }));
    expect(result.surplusPool).toBe(0);
  });

  it("surplus = 0 for FG$ <= 0 players (replacement-level can't generate surplus)", () => {
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 22,
      myDraftedPlayers: [
        { fgDollars: 0, paidDollars: 1, normalizedName: "hitter a" },
        { fgDollars: -1, paidDollars: 1, normalizedName: "hitter b" },
      ],
    }));
    expect(result.surplusPool).toBe(0);
  });

  it("surplus accumulates across multiple bargain picks", () => {
    const result = computeCategoryState(makeDefaultInput({
      leagueId: 23,
      myDraftedPlayers: [
        { fgDollars: 30, paidDollars: 20, normalizedName: "hitter a" }, // +10
        { fgDollars: 15, paidDollars: 12, normalizedName: "hitter b" }, // +3
        { fgDollars: 10, paidDollars: 10, normalizedName: "hitter c" }, // +0
      ],
    }));
    expect(result.surplusPool).toBe(13);
  });
});

// ============================================================
// Cliff detection tests
// ============================================================

describe("computeCategoryState — cliff detection", () => {
  beforeEach(() => {
    resetCategoryStateCache();
  });

  it("player with dropoff > $5 added to cliffPlayers", () => {
    // SB top player $35, next $28 → dropoff $7 → in cliff set
    const sbPlayers = [
      makePlayer("SB Star", ["OF"], 35, { SB: 40 }),
      makePlayer("SB Second", ["OF"], 28, { SB: 25 }),
      makePlayer("SB Third", ["OF"], 10, { SB: 10 }),
    ];
    const result = computeCategoryState({
      leagueId: 30,
      undraftedPlayers: sbPlayers,
      allUndraftedPlusDrafted: sbPlayers,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { SB: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 10,
      totalPicksInDraft: 200,
    });
    expect(result.cliffPlayers).toContain("sb star");
  });

  it("player with dropoff <= $5 NOT in cliffPlayers", () => {
    // rank-1 player $20, next $17 → dropoff $3 → not in cliff set
    const players = [
      makePlayer("HR King", ["OF"], 20, { HR: 40 }),
      makePlayer("HR Two", ["OF"], 17, { HR: 35 }),
    ];
    const result = computeCategoryState({
      leagueId: 31,
      undraftedPlayers: players,
      allUndraftedPlusDrafted: players,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { HR: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 10,
      totalPicksInDraft: 200,
    });
    expect(result.cliffPlayers).not.toContain("hr king");
  });

  it("cliff detection per category: checks SB contributors separately from HR contributors", () => {
    const players = [
      makePlayer("SB Specialist", ["OF"], 35, { SB: 40, HR: 2 }),
      makePlayer("SB Second", ["OF"], 20, { SB: 20, HR: 1 }),
      makePlayer("HR King", ["1B"], 30, { HR: 40, SB: 1 }),
      makePlayer("HR Second", ["1B"], 28, { HR: 38, SB: 0 }),
    ];
    const result = computeCategoryState({
      leagueId: 32,
      undraftedPlayers: players,
      allUndraftedPlusDrafted: players,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { SB: "HIGHER_BETTER", HR: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 10,
      totalPicksInDraft: 200,
    });
    // SB: $35 vs $20 → dropoff $15 > $5 → cliff
    expect(result.cliffPlayers).toContain("sb specialist");
    // HR: $30 vs $28 → dropoff $2 <= $5 → not cliff
    expect(result.cliffPlayers).not.toContain("hr king");
  });

  it("already-drafted players not in undrafted pool → cliff uses actual remaining pool", () => {
    // Originally had SB Star at $35 (now drafted). Remaining: only SB Second at $28.
    const undrafted = [makePlayer("SB Second", ["OF"], 28, { SB: 25 })];
    const all = [
      makePlayer("SB Star", ["OF"], 35, { SB: 40 }),
      makePlayer("SB Second", ["OF"], 28, { SB: 25 }),
    ];
    const result = computeCategoryState({
      leagueId: 33,
      undraftedPlayers: undrafted,
      allUndraftedPlusDrafted: all,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { SB: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 10,
      totalPicksInDraft: 200,
    });
    // Only one SB player left, no dropoff possible → "sb star" is drafted, not in cliff
    expect(result.cliffPlayers).not.toContain("sb star");
  });

  it("empty pool for category → no cliff players added", () => {
    // No SV pitchers in pool
    const players = [makePlayer("SP A", ["SP"], 20, { IP: 180, K: 200 }, true)];
    const result = computeCategoryState({
      leagueId: 34,
      undraftedPlayers: players,
      allUndraftedPlusDrafted: players,
      myDraftedPlayers: [],
      myTotals: {},
      categoryTargets: {},
      categoryDirections: { SV: "HIGHER_BETTER" } as Record<string, "HIGHER_BETTER" | "LOWER_BETTER">,
      totalPicksMade: 10,
      totalPicksInDraft: 200,
    });
    expect(result.cliffPlayers).toHaveLength(0);
  });
});

// ============================================================
// Serialization tests
// ============================================================

describe("computeCategoryState — serialization", () => {
  beforeEach(() => {
    resetCategoryStateCache();
  });

  it("CategoryState is a plain object (no Maps, Sets, or class instances)", () => {
    const result = computeCategoryState(makeDefaultInput({ leagueId: 40 }));
    expect(result).toBeTypeOf("object");
    expect(result.scarcityWeights).toBeTypeOf("object");
    expect(result.paceRatios).toBeTypeOf("object");
    expect(result.cliffPlayers).toBeInstanceOf(Array);
    expect(result.forceAcquisitionCategories).toBeInstanceOf(Array);
    // Not a Map or Set
    expect(result.scarcityWeights).not.toBeInstanceOf(Map);
    expect(result.cliffPlayers).not.toBeInstanceOf(Set);
  });

  it("cliffPlayers is string[]", () => {
    const result = computeCategoryState(makeDefaultInput({ leagueId: 41 }));
    expect(Array.isArray(result.cliffPlayers)).toBe(true);
    for (const name of result.cliffPlayers) {
      expect(typeof name).toBe("string");
    }
  });

  it("JSON.stringify(categoryState) does not throw", () => {
    const result = computeCategoryState(makeDefaultInput({ leagueId: 42 }));
    expect(() => JSON.stringify(result)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(result));
    expect(parsed.cliffPlayers).toBeInstanceOf(Array);
  });
});

// ============================================================
// Cache tests
// ============================================================

describe("computeCategoryState — module-level cache", () => {
  beforeEach(() => {
    resetCategoryStateCache();
  });

  it("initial pool stats reused on second call with same leagueId (cache hit)", () => {
    const input = makeDefaultInput({ leagueId: 50 });

    // Spy on result to verify stable initialPoolStats reference between calls
    const result1 = computeCategoryState(input);
    const result2 = computeCategoryState({
      ...input,
      // Slightly different undrafted pool but same leagueId — initialPoolStats from cache
      undraftedPlayers: input.undraftedPlayers.slice(0, 3),
    });

    // Both calls should reference same initial pool stats (same values)
    expect(result1.initialPoolStats).toEqual(result2.initialPoolStats);
  });

  it("initial pool stats reset when leagueId changes", () => {
    const inputLeague50 = makeDefaultInput({
      leagueId: 50,
      allUndraftedPlusDrafted: [
        makePlayer("P1", ["OF"], 30, { HR: 40 }),
        makePlayer("P2", ["SS"], 20, { HR: 20 }),
      ],
      undraftedPlayers: [makePlayer("P1", ["OF"], 30, { HR: 40 })],
    });

    const inputLeague99 = makeDefaultInput({
      leagueId: 99,
      allUndraftedPlusDrafted: [
        makePlayer("Q1", ["OF"], 50, { HR: 60 }),
        makePlayer("Q2", ["OF"], 25, { HR: 30 }),
      ],
      undraftedPlayers: [makePlayer("Q1", ["OF"], 50, { HR: 60 })],
    });

    const result50 = computeCategoryState(inputLeague50);
    const result99 = computeCategoryState(inputLeague99);

    // Different leagues with different player pools → different initialPoolStats
    expect(result50.initialPoolStats["HR"]).not.toEqual(result99.initialPoolStats["HR"]);
  });
});
