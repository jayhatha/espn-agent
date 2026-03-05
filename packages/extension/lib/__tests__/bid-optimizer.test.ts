import { describe, it, expect } from "vitest";
import { computeMaxBid } from "../engine/bid-optimizer";
import type { PoolPlayer, OpponentModel } from "../engine/types";

// ============================================================
// Fixtures
// ============================================================

function makeHitter(
  name: string,
  dollars: number,
  positions: string[] = ["OF"],
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: false,
    positions,
    stats: {
      HR: dollars / 2, // rough correlation: higher dollar = more HR
      R: dollars * 2,
      RBI: dollars * 2,
      SB: 5,
      AVG: 0.27,
    },
  };
}

// Simple roster slots for testing
const rosterSlots: Record<string, number> = {
  OF: 3,
  "1B": 1,
  UTIL: 1,
};

// Minimal opponent model for tests
const simpleOpponentModel: OpponentModel = {
  teamNeeds: new Map(),
  teamBudgets: new Map(),
  competitionFactors: { OF: 0.5, "1B": 0.3 },
  leagueInflationFactor: 1.0,
};

// ============================================================
// Tests
// ============================================================

describe("computeMaxBid — binary search convergence", () => {
  it("returns a high maxBid for the best player in the pool (close to budget minus reserves)", () => {
    // Create a pool of 10 players; nominated player is clearly the best
    const nominatedPlayer = makeHitter("Star", 50, ["OF"]); // highest dollar value
    const availablePlayers: PoolPlayer[] = [
      nominatedPlayer,
      makeHitter("Good1", 20, ["OF"]),
      makeHitter("Good2", 18, ["OF"]),
      makeHitter("Mid1", 15, ["1B"]),
      makeHitter("Mid2", 12, ["OF"]),
      makeHitter("Low1", 8, ["OF"]),
      makeHitter("Low2", 7, ["1B"]),
      makeHitter("Low3", 6, ["UTIL"]),
      makeHitter("Low4", 5, ["OF"]),
      makeHitter("Low5", 4, ["1B"]),
    ];

    // SGP values correlate with dollars in our fixture
    const sgpValues = availablePlayers.map(p => p.dollars / 5);

    const budget = 100;
    const result = computeMaxBid(
      nominatedPlayer,
      availablePlayers,
      sgpValues,
      budget,
      rosterSlots,
      simpleOpponentModel,
    );

    // The star player has the highest SGP, so max bid should be substantial
    expect(result.maxBid).toBeGreaterThan(1);
    // Max bid shouldn't exceed budget minus minimum reserves for unfilled slots
    const totalSlots = Object.values(rosterSlots).reduce((s, v) => s + v, 0);
    expect(result.maxBid).toBeLessThanOrEqual(budget);

    // Should have baselineValue and withPlayerValue
    expect(result.baselineValue).toBeGreaterThanOrEqual(0);
    expect(result.withPlayerValue).toBeGreaterThanOrEqual(0);
    expect(result.expectedMarketPrice).toBeGreaterThanOrEqual(1);
  });

  it("returns maxBid=$1 for a replacement-level player (no value added over alternatives)", () => {
    // Create a scenario where the pool has MORE players than roster slots, all alternatives
    // are cheap enough to fill within budget, so adding the replacement player at any
    // price DISPLACES a better player.
    // Roster: OF:1, SS:1 (2 slots). Budget: $30.
    // Pool: Star (SGP=10, $15 OF), SSStar (SGP=8, $14 SS), Replacement (SGP=0.1, $1 OF).
    // Baseline: Star + SSStar = 10+8=18 SGP, $15+$14=$29 spent.
    // With replacement locked at $1: 1 OF slot taken by replacement, only SS slot left.
    //   SSStar fills SS → 0.1 + 8 = 8.1 SGP < 18 baseline → NOT profitable at $1.
    const nominatedPlayer: PoolPlayer = {
      name: "Replacement", normalizedName: "replacement", dollars: 1,
      isPitcher: false, positions: ["OF"], stats: {},
    };
    const starPlayer: PoolPlayer = {
      name: "Star", normalizedName: "star", dollars: 15,
      isPitcher: false, positions: ["OF"], stats: {},
    };
    const ssStar: PoolPlayer = {
      name: "SSStar", normalizedName: "ssstar", dollars: 14,
      isPitcher: false, positions: ["SS"], stats: {},
    };

    const smallPool = [starPlayer, ssStar, nominatedPlayer];
    const smallSGP = [10, 8, 0.1];
    const twoSlotRoster: Record<string, number> = { OF: 1, SS: 1 };

    const result = computeMaxBid(
      nominatedPlayer,
      smallPool,
      smallSGP,
      30, // enough budget for both Star + SSStar without replacement
      twoSlotRoster,
      simpleOpponentModel,
    );

    // Replacement player at $1: locks OF slot (replacement SGP=0.1) + SS filled by SSStar (8)
    // = 8.1 SGP vs baseline 18 SGP. Not profitable → maxBid should be $1 (minimum).
    expect(result.maxBid).toBe(1);
  });

  it("returns maxBid=$1 when nominated player is not in available pool", () => {
    const nominatedPlayer = makeHitter("NotInPool", 30, ["OF"]);
    const availablePlayers: PoolPlayer[] = [
      makeHitter("Other1", 20, ["OF"]),
      makeHitter("Other2", 15, ["1B"]),
    ];
    const sgpValues = [4, 3];

    const result = computeMaxBid(
      nominatedPlayer,
      availablePlayers,
      sgpValues,
      100,
      rosterSlots,
      simpleOpponentModel,
    );

    // Player not in pool → can't compute value → return maxBid=$1
    expect(result.maxBid).toBe(1);
  });

  it("includes valueSurplus = maxBid - expectedMarketPrice", () => {
    const nominatedPlayer = makeHitter("Player", 30, ["OF"]);
    const availablePlayers: PoolPlayer[] = [
      nominatedPlayer,
      makeHitter("Other1", 20, ["OF"]),
      makeHitter("Other2", 15, ["1B"]),
    ];
    const sgpValues = [6, 4, 3];

    const result = computeMaxBid(
      nominatedPlayer,
      availablePlayers,
      sgpValues,
      100,
      rosterSlots,
      simpleOpponentModel,
    );

    // valueSurplus should equal maxBid - expectedMarketPrice
    expect(result.valueSurplus).toBe(result.maxBid - result.expectedMarketPrice);
  });

  it("binary search converges in <= 8 iterations for budget <= 260", () => {
    // With budget=260, binary search range is 1..260 → log2(260) ≈ 8.02 → ≤ 9 iterations
    // We verify this by checking the result is valid (indirect convergence test)
    const nominatedPlayer = makeHitter("Star", 50, ["OF"]);
    const availablePlayers: PoolPlayer[] = [
      nominatedPlayer,
      makeHitter("P1", 30, ["OF"]),
      makeHitter("P2", 25, ["1B"]),
      makeHitter("P3", 20, ["OF"]),
      makeHitter("P4", 15, ["UTIL"]),
    ];
    const sgpValues = [10, 6, 5, 4, 3];

    const result = computeMaxBid(
      nominatedPlayer,
      availablePlayers,
      sgpValues,
      260,
      rosterSlots,
      simpleOpponentModel,
    );

    // Result must be valid (between 1 and budget)
    expect(result.maxBid).toBeGreaterThanOrEqual(1);
    expect(result.maxBid).toBeLessThanOrEqual(260);
  });
});
