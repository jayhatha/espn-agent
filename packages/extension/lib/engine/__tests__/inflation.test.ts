import { describe, it, expect } from "vitest";
import { computeInflation } from "../inflation";
import type { DraftPick, AuctionValue } from "@espn-fantasy/shared";

// ============================================================
// Fixtures
// ============================================================

function makeAv(playerId: number, dollarValue: number): AuctionValue {
  return {
    playerId,
    playerName: `Player${playerId}`,
    positions: ["OF"],
    primaryPosition: "OF",
    dollarValue,
    vbdScore: 0,
    sgpTotal: 0,
  };
}

function makePick(playerId: number, cost: number, teamId = "team1"): DraftPick {
  return {
    playerId,
    playerName: `Player${playerId}`,
    teamId,
    teamName: "Team 1",
    pickNumber: playerId,
    timestamp: Date.now(),
    cost,
    positions: ["OF"],
  };
}

/**
 * Build a pool of N players with total value equal to totalValue,
 * each valued > $1 so they're all included in the remaining pool.
 */
function makePool(count: number, totalValue: number, startId = 1): AuctionValue[] {
  const perPlayer = Math.floor(totalValue / count);
  return Array.from({ length: count }, (_, i) => makeAv(startId + i, perPlayer));
}

// ============================================================
// Tests
// ============================================================

describe("computeInflation", () => {
  // 1. Basic neutral scenario: 10 teams, $260 each, no picks yet
  it("returns inflationFactor ~1.0 when budget equals value pool", () => {
    const totalTeams = 10;
    const auctionValues = makePool(100, 2600);
    const allTeamBudgets = Array.from({ length: 10 }, (_, i) => ({
      teamName: `Team${i}`,
      remainingBudget: 260,
    }));

    const result = computeInflation([], auctionValues, allTeamBudgets, totalTeams, 260);

    expect(result.inflationFactor).toBeCloseTo(1.0, 1);
    expect(result.inflationBand).toBe("neutral");
  });

  // 2. Overspending band: remaining budget < normalized remaining value
  it("returns inflationBand=overspending when teams have overspent", () => {
    const totalTeams = 10;
    // 5 picks at $60 each = $300 spent
    const picks = Array.from({ length: 5 }, (_, i) => makePick(i + 1, 60));
    // Remaining auction values: players 6-100
    const drafted = new Set(picks.map(p => p.playerId));
    const allValues = makePool(100, 2600);
    // allTeamBudgets: total $2300 remaining, but $2500 normalized value remains
    const totalRemainingBudget = 2300;
    const allTeamBudgets = [{ teamName: "aggregate", remainingBudget: totalRemainingBudget }];

    const result = computeInflation(picks, allValues, allTeamBudgets, totalTeams, 230);

    expect(result.inflationBand).toBe("overspending");
    expect(result.inflationFactor).toBeLessThan(1.0);
    expect(result.percentOverMarket).toBeLessThan(0);
  });

  // 3. Buying window band: 1.05 < factor <= 1.15
  it("returns inflationBand=buying_window when factor is 1.05-1.15", () => {
    const totalTeams = 10;
    // Construct a scenario where inflationFactor = 1.10
    // Formula: rawFactor = totalRemainingBudget / normalizedRemainingValue
    // With allTeamBudgets populated:
    //   totalInitialBudget = remainingBudget + amountSpent
    //   normalizationFactor = totalInitialBudget / totalAuctionValuePool
    //   normalizedRemainingValue = remainingValue * normalizationFactor
    //
    // Use matching budget and pool: totalAuctionValuePool = $2600, no picks,
    // no players drafted, allTeamBudgets sum = $2860 (10% over market)
    // totalInitialBudget = $2860 (no picks, so allTeamBudgets = initial)
    // normalizationFactor = 2860/2600 = 1.1
    // normalizedRemainingValue = 2600 * 1.1 = 2860
    // rawFactor = 2860 / 2860 = 1.0 -- hmm, neutral.
    //
    // Better approach: budget sum = $2860, auction pool = $2600, 20 players drafted
    // Draft 20 players; remaining pool = 80 players worth $2080 (80/100 * 2600)
    // totalInitialBudget = 2860 + spent; normalizationFactor = (2860+spent)/2600
    // normalizedRemainingValue = 2080 * normFactor
    // We want: 2860 / normalizedRemainingValue = 1.1
    // => normalizedRemainingValue = 2860/1.1 = 2600
    // => 2080 * normFactor = 2600 => normFactor = 2600/2080 = 1.25
    // => totalInitialBudget = 1.25 * 2600 = 3250
    // => spent = 3250 - 2860 = 390
    // So: 20 picks at $19.5 each = $390 spent
    const auctionValues = makePool(100, 2600);
    const picks = Array.from({ length: 20 }, (_, i) =>
      makePick(i + 1, Math.floor(390 / 20))
    );
    const allTeamBudgets = [{ teamName: "aggregate", remainingBudget: 2860 }];

    const result = computeInflation(picks, auctionValues, allTeamBudgets, totalTeams, 286);

    expect(result.inflationFactor).toBeGreaterThan(1.05);
    expect(result.inflationFactor).toBeLessThanOrEqual(1.15);
    expect(result.inflationBand).toBe("buying_window");
  });

  // 4. Strong value band: factor > 1.15
  it("returns inflationBand=strong_value when factor > 1.15", () => {
    const totalTeams = 10;
    // 50 players drafted at $1 each, so only $50 spent but $2550 remaining budget remains
    // Remaining value pool is only ~$1300 (half the players drafted)
    const picks = Array.from({ length: 50 }, (_, i) => makePick(i + 1, 1));
    const allValues = makePool(100, 2600);
    // Remaining budget = $2550, remaining value (normalized) ~$1300 => factor ~1.96
    const allTeamBudgets = [{ teamName: "aggregate", remainingBudget: 2550 }];

    const result = computeInflation(picks, allValues, allTeamBudgets, totalTeams, 255);

    expect(result.inflationFactor).toBeGreaterThan(1.15);
    expect(result.inflationBand).toBe("strong_value");
  });

  // 5. Clamping upper bound: factor clamped to 2.0
  it("clamps inflationFactor to 2.0 when raw factor is very high", () => {
    const totalTeams = 10;
    // Almost all players drafted, tiny remaining value but large budget left
    const allValues = makePool(100, 2600);
    // Draft 95 players, leaving only 5 players worth ~$130 total
    const picks = Array.from({ length: 95 }, (_, i) => makePick(i + 1, 1));
    // Large remaining budget
    const allTeamBudgets = [{ teamName: "aggregate", remainingBudget: 2400 }];

    const result = computeInflation(picks, allValues, allTeamBudgets, totalTeams, 240);

    expect(result.inflationFactor).toBe(2.0);
    expect(result.rawInflationFactor).toBeGreaterThan(2.0);
  });

  // 6. Clamping lower bound: factor clamped to 0.5
  it("clamps inflationFactor to 0.5 when raw factor is very low", () => {
    const totalTeams = 10;
    // Scenario where raw factor << 0.5:
    // - auction values sum to $2600 (matching budget for neutral normalization)
    // - 10 players drafted at $200 each ($2000 spent) - teams blew most budget early
    // - remaining budget = $600 across all teams
    // - remaining auction values = 90 players worth $2340
    // totalInitialBudget = 600 + 2000 = 2600
    // normalizationFactor = 2600/2600 = 1.0
    // normalizedRemainingValue = 2340 * 1.0 = 2340
    // rawFactor = 600 / 2340 = 0.256 < 0.5 -> clamped to 0.5
    const allValues = makePool(100, 2600);
    const picks = Array.from({ length: 10 }, (_, i) => makePick(i + 1, 200));
    const allTeamBudgets = [{ teamName: "aggregate", remainingBudget: 600 }];

    const result = computeInflation(picks, allValues, allTeamBudgets, totalTeams, 60);

    expect(result.inflationFactor).toBe(0.5);
    expect(result.rawInflationFactor).toBeLessThan(0.5);
  });

  // 7. Confidence: high when >= 20 players remain, low when < 20
  it("returns confidence=high when >= 20 valued players remain", () => {
    const totalTeams = 10;
    const allValues = makePool(50, 2600);
    const allTeamBudgets = [{ teamName: "aggregate", remainingBudget: 2600 }];

    const result = computeInflation([], allValues, allTeamBudgets, totalTeams, 260);

    expect(result.confidence).toBe("high");
  });

  it("returns confidence=low when < 20 valued players remain", () => {
    const totalTeams = 10;
    const allValues = makePool(25, 2600);
    // Draft 10 players, leaving 15 remaining (< 20)
    const picks = Array.from({ length: 10 }, (_, i) => makePick(i + 1, 10));
    const allTeamBudgets = [{ teamName: "aggregate", remainingBudget: 2500 }];

    const result = computeInflation(picks, allValues, allTeamBudgets, totalTeams, 250);

    expect(result.confidence).toBe("low");
  });

  // 8. Normalization: FG values summing to more than league budget
  it("normalizes correctly when FG values exceed league budget", () => {
    const totalTeams = 10;
    // FG values sum to $3500, but league budget is only $2600
    const allValues = makePool(100, 3500);
    const allTeamBudgets = Array.from({ length: 10 }, (_, i) => ({
      teamName: `Team${i}`,
      remainingBudget: 260,
    }));

    const result = computeInflation([], allValues, allTeamBudgets, totalTeams, 260);

    // With normalization, factor should be ~1.0 not dramatically below 1
    expect(result.inflationFactor).toBeGreaterThan(0.9);
    expect(result.inflationFactor).toBeLessThanOrEqual(1.1);
  });

  // 9a. allTeamBudgets fallback: empty — estimates from picks
  it("falls back to pick-based estimation when allTeamBudgets is empty", () => {
    const totalTeams = 10;
    const allValues = makePool(50, 2600);
    // 5 picks at $50 each from myTeam, my remaining budget = 10
    const picks = Array.from({ length: 5 }, (_, i) =>
      makePick(i + 1, 50, "myTeam")
    );

    // Should not throw and should return a valid result
    const result = computeInflation(picks, allValues, [], totalTeams, 10);

    expect(result.inflationFactor).toBeGreaterThan(0);
    expect(result.totalRemainingBudget).toBeGreaterThanOrEqual(0);
  });

  // 9b. allTeamBudgets populated: uses sum directly
  it("uses sum of allTeamBudgets when provided", () => {
    const totalTeams = 4;
    const allValues = makePool(40, 1040); // 4 teams * $260
    const allTeamBudgets = [
      { teamName: "Team1", remainingBudget: 200 },
      { teamName: "Team2", remainingBudget: 180 },
      { teamName: "Team3", remainingBudget: 220 },
      { teamName: "Team4", remainingBudget: 240 },
    ];

    const result = computeInflation([], allValues, allTeamBudgets, totalTeams, 200);

    expect(result.totalRemainingBudget).toBe(840); // 200+180+220+240
  });

  // 10. Edge case: no auction values returns factor 1.0
  it("returns inflationFactor=1.0 when auctionValues is empty", () => {
    const result = computeInflation([], [], [], 10, 260);

    expect(result.inflationFactor).toBe(1.0);
    expect(result.rawInflationFactor).toBe(1.0);
  });

  // 11. percentOverMarket reflects the direction of inflation correctly
  it("calculates percentOverMarket correctly from inflationFactor", () => {
    const totalTeams = 10;
    const allValues = makePool(50, 2600);
    // Balanced scenario: factor ~1.0
    const allTeamBudgets = Array.from({ length: 10 }, () => ({
      teamName: "Team",
      remainingBudget: 260,
    }));

    const result = computeInflation([], allValues, allTeamBudgets, totalTeams, 260);

    expect(result.percentOverMarket).toBe(Math.round((result.inflationFactor - 1) * 100));
  });

  // 12. Players with dollarValue <= 1 excluded from remaining pool
  it("excludes players with dollarValue <= 1 from the remaining value pool", () => {
    const totalTeams = 10;
    // Mix: 30 players with value > 1, 20 players worth $1 (filler)
    const valuedPlayers = makePool(30, 2600, 1);
    const fillerPlayers = Array.from({ length: 20 }, (_, i) =>
      makeAv(100 + i, 1)
    );
    const allValues = [...valuedPlayers, ...fillerPlayers];
    const allTeamBudgets = Array.from({ length: 10 }, () => ({
      teamName: "Team",
      remainingBudget: 260,
    }));

    const result = computeInflation([], allValues, allTeamBudgets, totalTeams, 260);

    // Confidence is high because 30 valued players remain (>= 20)
    expect(result.confidence).toBe("high");
    // inflationFactor should be near 1.0 since valued pool is well-matched
    expect(result.inflationFactor).toBeGreaterThan(0.8);
  });
});
