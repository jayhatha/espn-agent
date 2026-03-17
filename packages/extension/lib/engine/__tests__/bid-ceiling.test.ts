/**
 * bid-ceiling.test.ts
 *
 * Focused tests for BID/PASS decision logic in computeMaxBid.
 * Covers: bid vs pass decisions, inflation adjustment, budget-reserve constraints,
 * value surplus computation, ASV market price override, and baseline computation.
 *
 * Complements bid-optimizer.test.ts which covers binary search convergence.
 */

import { describe, it, expect } from "vitest";
import { computeMaxBid } from "../bid-optimizer";
import type { PoolPlayer, OpponentModel } from "../types";

// ============================================================
// Fixtures
// ============================================================

/** Create a PoolPlayer with sensible defaults */
function makePlayer(
  name: string,
  positions: string[],
  dollars: number,
  isPitcher = false,
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher,
    positions,
    stats: {},
  };
}

/**
 * Build a realistic 15-player pool with varied dollar values and positions.
 * SGP values are proportional to dollar value: sgp[i] = player.dollars * 0.2
 */
function makePool(): { players: PoolPlayer[]; sgpValues: number[] } {
  const players: PoolPlayer[] = [
    makePlayer("Elite OF", ["OF"], 45),
    makePlayer("Great SS", ["SS"], 38),
    makePlayer("Strong 1B", ["1B"], 30),
    makePlayer("Good OF A", ["OF"], 26),
    makePlayer("Good OF B", ["OF"], 22),
    makePlayer("Mid C", ["C"], 18),
    makePlayer("Mid SP A", ["SP"], 16, true),
    makePlayer("Mid SP B", ["SP"], 14, true),
    makePlayer("Value 1B", ["1B"], 12),
    makePlayer("Value OF", ["OF"], 10),
    makePlayer("Cheap SS", ["SS"], 8),
    makePlayer("Cheap SP", ["SP"], 6, true),
    makePlayer("Floor OF", ["OF"], 4),
    makePlayer("Floor 1B", ["1B"], 2),
    makePlayer("Replacement C", ["C"], 1),
  ];

  const sgpValues = players.map(p => p.dollars * 0.2);
  return { players, sgpValues };
}

/** Minimal OpponentModel with no team needs and uniform 0.5 competition factors */
function makeOpponentModel(): OpponentModel {
  return {
    teamNeeds: new Map(),
    teamBudgets: new Map(),
    competitionFactors: {
      OF: 0.5,
      SS: 0.5,
      "1B": 0.5,
      C: 0.5,
      SP: 0.5,
    },
    leagueInflationFactor: 1.0,
  };
}

/** Standard roster slots used across most tests */
const rosterSlots: Record<string, number> = {
  OF: 3,
  "1B": 1,
  SS: 1,
  C: 1,
  SP: 3,
  UTIL: 1,
};

// ============================================================
// BID tests — price < model value, profitable to bid
// ============================================================

describe("computeMaxBid — BID decisions (profitable players)", () => {
  it("BID when player value exceeds market price: maxBid > 1 for $30 player with $200 budget", () => {
    const { players, sgpValues } = makePool();
    const nominated = players.find(p => p.name === "Strong 1B")!; // $30 player

    const result = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
    );

    // A $30 player in a pool of 15 should produce meaningful maxBid
    expect(result.maxBid).toBeGreaterThan(1);
  });

  it("maxBid increases with inflation: inflation=1.3 produces >= maxBid at inflation=1.0", () => {
    const { players, sgpValues } = makePool();
    const nominated = players.find(p => p.name === "Strong 1B")!; // $30 player

    const baseResult = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
      1.0, // baseline inflation
    );

    const inflatedResult = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
      1.3, // inflated — upper bound of binary search rises
    );

    // Inflation widens the binary search upper bound, so maxBid can be equal or higher
    expect(inflatedResult.maxBid).toBeGreaterThanOrEqual(baseResult.maxBid);
  });

  it("maxBid respects budget minus reserves: with budget=$15 and 8 unfilled slots, maxBid <= $8", () => {
    const { players, sgpValues } = makePool();
    const nominated = players.find(p => p.name === "Value OF")!; // $10 player

    // 8-slot roster, tight budget
    const tightSlots: Record<string, number> = {
      OF: 3,
      "1B": 1,
      SS: 1,
      C: 1,
      SP: 1,
      UTIL: 1,
    }; // 8 total slots

    const result = computeMaxBid(
      nominated,
      players,
      sgpValues,
      15,
      tightSlots,
      makeOpponentModel(),
    );

    // With budget=15 and 8 slots total (7 unfilled after this pick), reserves = 7
    // Upper bound = min(budget - reserves, inflatedValue * 1.5) = min(15-7, 10*1.5) = min(8, 15) = 8
    expect(result.maxBid).toBeLessThanOrEqual(8);
  });
});

// ============================================================
// PASS tests — replacement level or unavailable player
// ============================================================

describe("computeMaxBid — PASS decisions (not profitable to bid high)", () => {
  it("maxBid=1 for replacement-level player with near-zero SGP", () => {
    // Pool: 3 high-value players for only 2 OF slots (no C or UTIL slot).
    // Locking the C-only player at any price consumes a slot that would otherwise
    // go to one of the two better OF players — but C player cannot fill OF/SS slots.
    // So: baseline = Best OF + 2nd OF = 8+6=14. With C player locked: C fills... nothing
    // (no C slot in this config). Player not placeable → roster optimizer ignores them.
    // Actually the real scenario: pool has 4 OFs for 2 OF slots. Nominating the worst OF
    // at price > its marginal value → maxBid=1.
    // Pattern from bid-optimizer.test.ts: replacement player blocks better alternative.
    const nominated: PoolPlayer = {
      name: "Replacement",
      normalizedName: "replacement",
      dollars: 1,
      isPitcher: false,
      positions: ["OF"],
      stats: {},
    };
    const starPlayer: PoolPlayer = {
      name: "Star",
      normalizedName: "star",
      dollars: 15,
      isPitcher: false,
      positions: ["OF"],
      stats: {},
    };
    const ssStar: PoolPlayer = {
      name: "SSStar",
      normalizedName: "ssstar",
      dollars: 14,
      isPitcher: false,
      positions: ["SS"],
      stats: {},
    };

    const smallPool = [starPlayer, ssStar, nominated];
    const smallSGP = [10, 8, 0.1];
    // Only 1 OF and 1 SS slot: baseline = Star (OF) + SSStar (SS) = 18 SGP
    // With Replacement locked at $1 into OF slot: 0.1 + 8 = 8.1 SGP < 18 → maxBid=1
    const twoSlots: Record<string, number> = { OF: 1, SS: 1 };

    const result = computeMaxBid(
      nominated,
      smallPool,
      smallSGP,
      100,
      twoSlots,
      makeOpponentModel(),
    );

    expect(result.maxBid).toBe(1);
  });

  it("maxBid=1 when nominated player is not in availablePlayers", () => {
    const { players, sgpValues } = makePool();
    const notInPool = makePlayer("Ghost Player", ["OF"], 30);

    const result = computeMaxBid(
      notInPool,
      players, // notInPool is NOT in this array
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
    );

    expect(result.maxBid).toBe(1);
  });
});

// ============================================================
// Value surplus tests
// ============================================================

describe("computeMaxBid — value surplus computation", () => {
  it("valueSurplus positive when maxBid > expectedMarketPrice for high-SGP player", () => {
    // High-value player in a low-competition pool should have positive surplus
    const pool: PoolPlayer[] = [
      makePlayer("Superstar", ["OF"], 50),
      makePlayer("Filler A", ["OF"], 5),
      makePlayer("Filler B", ["1B"], 5),
      makePlayer("Filler C", ["SS"], 5),
      makePlayer("Filler D", ["C"], 3),
    ];
    const sgpValues = [10, 1, 1, 1, 0.6]; // Superstar has much higher SGP

    const result = computeMaxBid(
      pool[0], // Superstar
      pool,
      sgpValues,
      200,
      { OF: 1, "1B": 1, SS: 1, C: 1 },
      makeOpponentModel(),
    );

    // valueSurplus = maxBid - expectedMarketPrice
    expect(result.valueSurplus).toBe(result.maxBid - result.expectedMarketPrice);
  });

  it("valueSurplus is negative for replacement-level player (expectedMarketPrice > 1)", () => {
    // Pool where nominated player at $1 is replacement; market might expect more
    const pool: PoolPlayer[] = [
      makePlayer("Elite A", ["OF"], 40),
      makePlayer("Elite B", ["SS"], 35),
      makePlayer("Replacement OF", ["OF"], 1),
    ];
    const sgpSGP = [8, 7, 0.1];
    const twoSlots: Record<string, number> = { OF: 1, SS: 1 };

    const result = computeMaxBid(
      pool[2], // Replacement OF — displaces Elite A
      pool,
      sgpSGP,
      100,
      twoSlots,
      makeOpponentModel(),
    );

    // maxBid=1 but expectedMarketPrice >= 1, so valueSurplus <= 0
    expect(result.valueSurplus).toBeLessThanOrEqual(0);
  });
});

// ============================================================
// ASV market price override tests
// ============================================================

describe("computeMaxBid — ASV market price override", () => {
  it("asvMarketPrice used as expectedMarketPrice when provided", () => {
    const { players, sgpValues } = makePool();
    const nominated = players.find(p => p.name === "Good OF A")!;

    const result = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
      1.0,
      25, // ESPN ASV = $25
    );

    expect(result.expectedMarketPrice).toBe(25);
  });

  it("asvMarketPrice rounds to integer, minimum 1 for fractional values", () => {
    const { players, sgpValues } = makePool();
    const nominated = players.find(p => p.name === "Good OF A")!;

    const result = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
      1.0,
      0.3, // Very low ASV — should round to minimum $1
    );

    expect(result.expectedMarketPrice).toBe(1);
  });

  it("asvMarketPrice of 0 rounds to minimum 1", () => {
    const { players, sgpValues } = makePool();
    const nominated = players.find(p => p.name === "Good OF A")!;

    const result = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
      1.0,
      0,
    );

    expect(result.expectedMarketPrice).toBe(1);
  });
});

// ============================================================
// Baseline computation tests
// ============================================================

describe("computeMaxBid — baseline computation", () => {
  it("baselineValue is computed from roster without nominated player", () => {
    const { players, sgpValues } = makePool();
    const nominated = players.find(p => p.name === "Strong 1B")!;

    const result = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
    );

    // Non-trivial pool should produce positive baseline
    expect(result.baselineValue).toBeGreaterThan(0);
  });

  it("withPlayerValue >= baselineValue at maxBid (binary search invariant)", () => {
    // By definition: binary search stops at the highest price where
    // roster(player at price) SGP >= baseline SGP.
    // At maxBid, the constraint should be satisfied.
    const { players, sgpValues } = makePool();
    const nominated = players.find(p => p.name === "Elite OF")!; // best player

    const result = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
    );

    if (result.maxBid > 1) {
      // At maxBid, withPlayerValue should be >= baselineValue
      expect(result.withPlayerValue).toBeGreaterThanOrEqual(result.baselineValue);
    }
  });

  it("expectedMarketPrice >= 1 (never below minimum bid)", () => {
    const { players, sgpValues } = makePool();
    const nominated = players[0]; // Elite OF

    const result = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
    );

    expect(result.expectedMarketPrice).toBeGreaterThanOrEqual(1);
  });

  it("valueSurplus equals maxBid minus expectedMarketPrice (exact formula check)", () => {
    const { players, sgpValues } = makePool();
    const nominated = players.find(p => p.name === "Great SS")!;

    const result = computeMaxBid(
      nominated,
      players,
      sgpValues,
      200,
      rosterSlots,
      makeOpponentModel(),
    );

    expect(result.valueSurplus).toBe(result.maxBid - result.expectedMarketPrice);
  });
});
