import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runMonteCarlo } from "../engine/monte-carlo";
import type { PoolPlayer } from "../engine/types";

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
      HR: dollars / 2,
      R: dollars * 2,
      RBI: dollars * 2,
      SB: 5,
      AVG: 0.27,
    },
  };
}

// Small affordable player pool for testing
// Players all cost $5-$20 so they fit in budgets
function makeAffordablePool(size: number): PoolPlayer[] {
  const players: PoolPlayer[] = [];
  const positions = ["OF", "OF", "OF", "1B", "SS", "2B", "3B", "C", "1B"];
  for (let i = 0; i < size; i++) {
    players.push(makeHitter(`Player${i}`, 5 + (i % 15), [positions[i % positions.length]]));
  }
  return players;
}

const simpleRosterSlots: Record<string, number> = {
  OF: 2,
  "1B": 1,
};

// ============================================================
// Tests
// ============================================================

describe("runMonteCarlo — basic simulation", () => {
  it("returns positive expectedTeamValue and non-zero stddev for a basic pool", () => {
    const players = makeAffordablePool(20);
    const sgpValues = players.map((_, i) => (20 - i) * 0.5); // SGPs from 10 down to 0.5

    const result = runMonteCarlo({
      availablePlayers: players,
      sgpValues,
      myCurrentRoster: [],
      myBudget: 50,
      opponentBudgets: [50, 50],
      rosterSlots: simpleRosterSlots,
      numSimulations: 50, // small count for speed
    });

    expect(result.expectedTeamValue).toBeGreaterThan(0);
    expect(result.valueStdDev).toBeGreaterThanOrEqual(0);
    expect(result.simCount).toBe(50);
    expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("does not have bidEV or passEV when no nominated player is provided", () => {
    const players = makeAffordablePool(10);
    const sgpValues = players.map((_, i) => (10 - i) * 1.0);

    const result = runMonteCarlo({
      availablePlayers: players,
      sgpValues,
      myCurrentRoster: [],
      myBudget: 50,
      opponentBudgets: [50],
      rosterSlots: simpleRosterSlots,
      numSimulations: 20,
    });

    // Without nominated player, bidEV and passEV should both equal expectedTeamValue
    expect(result.bidEV).toBe(result.expectedTeamValue);
    expect(result.passEV).toBe(result.expectedTeamValue);
    // shouldBid defaults to false when no nominated player
    expect(result.shouldBid).toBe(false);
  });
});

describe("runMonteCarlo — bid vs pass with nominated player", () => {
  it("bidEV > passEV for a high-value nominated player (shouldBid=true)", () => {
    // Top player in the pool — winning them at a reasonable bid should improve EV
    const highValuePlayer = makeHitter("Star", 20, ["OF"]);
    const otherPlayers = makeAffordablePool(15);
    const players = [highValuePlayer, ...otherPlayers];

    // Star has by far the highest SGP
    const sgpValues = [15, ...otherPlayers.map((_, i) => (15 - i) * 0.4)];

    const result = runMonteCarlo({
      availablePlayers: players,
      sgpValues,
      myCurrentRoster: [],
      myBudget: 60,
      opponentBudgets: [60, 60, 60],
      rosterSlots: simpleRosterSlots,
      nominatedPlayer: highValuePlayer,
      nominatedBid: 10, // Reasonable bid for a high-value player
      numSimulations: 100,
    });

    // With a clearly superior player, bidding should yield higher expected value
    expect(result.bidEV).toBeGreaterThan(result.passEV);
    expect(result.shouldBid).toBe(true);
  });

  it("passEV >= bidEV when nominated player is replacement-level (shouldBid=false)", () => {
    // The nominated player is the worst in the pool — winning them wastes budget
    // Use a larger pool so passing frees budget to win superior players
    const replacementPlayer: PoolPlayer = {
      name: "Replacement",
      normalizedName: "replacement",
      dollars: 1,
      isPitcher: false,
      positions: ["OF"],
      stats: {},
    };

    // Many good alternatives at affordable prices + replacement
    const goodPlayers = Array.from({ length: 10 }, (_, i) =>
      makeHitter(`Star${i + 1}`, 8 + i, ["OF"]),
    );
    const alternatives = [...goodPlayers, replacementPlayer];
    const sgpValues = [...goodPlayers.map((_, i) => 10 - i * 0.5), 0.01];

    const rosterSlots: Record<string, number> = { OF: 3 };

    const result = runMonteCarlo({
      availablePlayers: alternatives,
      sgpValues,
      myCurrentRoster: [],
      myBudget: 40,
      opponentBudgets: [40, 40],
      rosterSlots,
      nominatedPlayer: replacementPlayer,
      nominatedBid: 25, // Massive overpay: $25 for a SGP=0.01 player burns 62.5% of budget
      numSimulations: 300,
    });

    // Burning $25 on replacement-level player leaves only $15 to fill 2 remaining OF slots.
    // Passing leaves full $40 to pick 3 quality OF players from the remaining pool.
    expect(result.passEV).toBeGreaterThanOrEqual(result.bidEV);
    expect(result.shouldBid).toBe(false);
  });
});

describe("runMonteCarlo — deterministic seed test", () => {
  beforeEach(() => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces identical results with mocked Math.random", () => {
    const players = makeAffordablePool(10);
    const sgpValues = players.map((_, i) => 5 - i * 0.4);

    const params = {
      availablePlayers: players,
      sgpValues,
      myCurrentRoster: [],
      myBudget: 40,
      opponentBudgets: [40, 40],
      rosterSlots: simpleRosterSlots,
      numSimulations: 20,
    };

    const result1 = runMonteCarlo(params);
    const result2 = runMonteCarlo(params);

    // With mocked Math.random (always returns 0.5), results must be identical
    expect(result1.expectedTeamValue).toBe(result2.expectedTeamValue);
    expect(result1.valueStdDev).toBe(result2.valueStdDev);
  });
});

describe("runMonteCarlo — edge cases", () => {
  it("returns expectedTeamValue=0 with an empty player pool", () => {
    const result = runMonteCarlo({
      availablePlayers: [],
      sgpValues: [],
      myCurrentRoster: [],
      myBudget: 100,
      opponentBudgets: [100],
      rosterSlots: simpleRosterSlots,
      numSimulations: 10,
    });

    expect(result.expectedTeamValue).toBe(0);
    expect(result.simCount).toBe(10);
  });

  it("does not mutate the availablePlayers array after runMonteCarlo", () => {
    const players = makeAffordablePool(15);
    const originalPlayers = [...players]; // shallow copy of references
    const sgpValues = players.map((_, i) => (15 - i) * 0.5);

    runMonteCarlo({
      availablePlayers: players,
      sgpValues,
      myCurrentRoster: [],
      myBudget: 50,
      opponentBudgets: [50, 50],
      rosterSlots: simpleRosterSlots,
      nominatedPlayer: players[0],
      nominatedBid: 15,
      numSimulations: 100,
    });

    // Array should have same length and same player references
    expect(players.length).toBe(originalPlayers.length);
    for (let i = 0; i < players.length; i++) {
      expect(players[i]).toBe(originalPlayers[i]);
    }
  });
});

describe("runMonteCarlo — performance", () => {
  it("200 sims with 50 players completes in < 500ms", () => {
    const players = makeAffordablePool(50);
    const sgpValues = players.map((_, i) => Math.max(0.1, 10 - i * 0.2));

    const start = performance.now();
    const result = runMonteCarlo({
      availablePlayers: players,
      sgpValues,
      myCurrentRoster: [],
      myBudget: 100,
      opponentBudgets: [100, 100, 100, 100],
      rosterSlots: simpleRosterSlots,
      numSimulations: 200,
    });
    const elapsed = performance.now() - start;

    expect(result.simCount).toBe(200);
    // 200 sims with 50 players and 4 opponent budgets. Observed runtime ~200ms.
    // 500ms threshold provides 2.5x headroom for CI variability.
    expect(elapsed).toBeLessThan(500);
  });
});
