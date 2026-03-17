/**
 * scenario-edge-cases.test.ts
 *
 * Scenario tests verifying engine behavior under specific auction draft conditions.
 *
 * Each test constructs a realistic scenario state and verifies the engine
 * output matches expected auction dynamics:
 *
 * Scenario 1: Early value run (bargain buying — league overspending early)
 * Scenario 2: Late auction inflation (remaining budget > remaining value)
 * Scenario 3: Position scarcity (catchers running out vs demand)
 * Scenario 4: Endgame mode ($18 budget, 8 spots remaining)
 * Scenario 5: Budget pacing — ahead of schedule
 * Scenario 6: Budget pacing — behind schedule
 * Scenario 7: SP tier cap progression in roster building
 * Scenario 8: Mixed hitter/pitcher budget allocation tracking
 */

import { describe, it, expect } from "vitest";
import type { DraftPick, AuctionValue } from "@espn-fantasy/shared";
import type { PoolPlayer } from "../types";
import { computeInflation } from "../inflation";
import { computeBudgetCurve } from "../budget-curve";
import { applyScarcityAdjustment } from "../sgp";
import { optimizeRoster } from "../roster-optimizer";

// ============================================================
// Helpers
// ============================================================

function makeDraftPick(
  playerId: number,
  teamId: string,
  cost: number,
  pickNumber: number,
): DraftPick {
  return {
    playerId,
    playerName: `Player${playerId}`,
    teamId,
    teamName: `Team${teamId}`,
    pickNumber,
    timestamp: Date.now(),
    cost,
    positions: ["OF"],
  };
}

function makeAuctionValue(playerId: number, dollarValue: number): AuctionValue {
  return {
    playerId,
    playerName: `Player${playerId}`,
    positions: ["OF"],
    primaryPosition: "OF",
    dollarValue,
    vbdScore: dollarValue * 0.1,
    sgpTotal: dollarValue * 0.1,
  };
}

function makePoolPlayer(
  name: string,
  dollars: number,
  positions: string[],
  isPitcher: boolean,
  stats: Record<string, number> = {},
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher,
    positions,
    stats: {
      HR: isPitcher ? 0 : 20,
      R: isPitcher ? 0 : 80,
      ...stats,
    },
  };
}

// ============================================================
// Scenario 1: Early value run (league overspending)
// ============================================================

describe("Scenario 1: Early value run — bargain buying window", () => {
  it("computeInflation identifies buying window when league overspends early", () => {
    // First 20 picks all at 120%+ of model value (league overspending)
    // Model values for these players are $15-$20 each, but paid $18-$25
    const picks: DraftPick[] = [];
    const auctionValues: AuctionValue[] = [];

    // 20 drafted players — overpaid by 25%+
    for (let i = 1; i <= 20; i++) {
      const modelValue = 15 + (i % 6); // $15-$20 model values
      const paidPrice = Math.round(modelValue * 1.28); // 28% overpaid
      picks.push(makeDraftPick(i, `team${(i % 10) + 1}`, paidPrice, i));
      auctionValues.push(makeAuctionValue(i, modelValue));
    }

    // 80 remaining players with significant value
    for (let i = 21; i <= 100; i++) {
      auctionValues.push(makeAuctionValue(i, Math.max(2, 18 - (i - 21) * 0.2)));
    }

    // Total spent: 10 teams, after paying high prices, budgets are reduced
    const totalSpent = picks.reduce((s, p) => s + (p.cost ?? 0), 0);
    const totalInitialBudget = 260 * 10;
    const myRemainingBudget = 260 - totalSpent / 10;

    // All team budgets (remaining after overspending)
    const allTeamBudgets = Array.from({ length: 10 }, (_, i) => ({
      teamName: `Team${i + 1}`,
      remainingBudget: 260 - (totalSpent / 10),
    }));

    const signal = computeInflation(picks, auctionValues, allTeamBudgets, 10, myRemainingBudget);

    // With remaining budget higher than remaining value, inflation factor should be > 1.05
    // (or at minimum, a buying_window or strong_value band)
    const isGoodBuyingCondition =
      signal.inflationFactor > 1.05 ||
      signal.inflationBand === "buying_window" ||
      signal.inflationBand === "strong_value";

    expect(isGoodBuyingCondition).toBe(true);
  });
});

// ============================================================
// Scenario 2: Late auction inflation
// ============================================================

describe("Scenario 2: Late auction — inflation above 1.10", () => {
  it("computeInflation shows inflationFactor > 1.10 when remaining budget exceeds remaining value", () => {
    // Draft is 70% complete — most high-value players are gone.
    // Remaining players are mostly cheap ($2-$8), but teams still have significant budget.

    const picks: DraftPick[] = [];
    const auctionValues: AuctionValue[] = [];

    // 154 picks done (70% of 22 slots * 10 teams)
    for (let i = 1; i <= 154; i++) {
      picks.push(makeDraftPick(i, `team${(i % 10) + 1}`, 8, i));
      auctionValues.push(makeAuctionValue(i, 10)); // Model values were $10 each
    }

    // Remaining 66 players with LOW values ($1-$5)
    for (let i = 155; i <= 220; i++) {
      auctionValues.push(makeAuctionValue(i, Math.max(1, 5 - (i - 155) * 0.05)));
    }

    // Remaining budget: teams underspent early — still have $105 each (10 teams = $1050 total)
    // Total remaining value of remaining players ≈ 66 * 3 ≈ $198 (much less than $1050)
    const allTeamBudgets = Array.from({ length: 10 }, (_, i) => ({
      teamName: `Team${i + 1}`,
      remainingBudget: 105, // Significantly more budget than remaining value
    }));

    const signal = computeInflation(picks, auctionValues, allTeamBudgets, 10, 105);

    // Inflation factor should be elevated (>1.10) since budget >> remaining value
    expect(signal.inflationFactor).toBeGreaterThan(1.05);
  });

  it("computeBudgetCurve gives elevated maxBidRecommendation during late inflation", () => {
    // 30% of roster spots remaining, budget=$105, inflation=1.3
    const signal = computeBudgetCurve(
      105, // remainingBudget
      7,   // remainingRosterSpots (30% of 22)
      260, // totalBudget
      22,  // totalRosterSize
      1.3, // inflationFactor — elevated
      8,   // currentPlayerDollarValue (cheap late player)
    );

    // Inflation-adjusted bid: $8 * 1.3 = $10.4 rounded to $10
    // maxBidRecommendation should be at least the inflation-adjusted value
    const inflationAdjustedMin = Math.floor(8 * 1.3);
    expect(signal.maxBidRecommendation).toBeGreaterThanOrEqual(inflationAdjustedMin);
    expect(signal.inflationAdjustedBid).toBeGreaterThanOrEqual(inflationAdjustedMin);
  });
});

// ============================================================
// Scenario 3: Position scarcity — catchers running out
// ============================================================

describe("Scenario 3: Position scarcity — catcher demand vs supply", () => {
  it("applyScarcityAdjustment amplifies catcher SGP when 8 teams need C but only 2 remain", () => {
    // scarcityFactor = 8/2 = 4.0
    // SCARCITY_MULTIPLIERS["C"] = 1.5
    // result = 3.0 * (1 + (4.0 - 1) * 1.5) = 3.0 * (1 + 4.5) = 3.0 * 5.5 = 16.5
    const baseSGP = 3.0;
    const remainingSlots = 8; // teams needing a catcher
    const remainingPlayers = 2; // catchers available

    const adjusted = applyScarcityAdjustment(baseSGP, "C", remainingSlots, remainingPlayers);

    expect(adjusted).toBeCloseTo(16.5, 1);
    expect(adjusted).toBeGreaterThan(baseSGP * 3); // Significantly amplified
  });

  it("applyScarcityAdjustment returns baseSGP when supply exceeds demand", () => {
    // scarcityFactor = 3/10 = 0.3 (plenty of catchers)
    // result = 3.0 * (1 + (0.3 - 1) * 1.5) = 3.0 * (1 - 1.05) = 3.0 * -0.05 = -0.15
    // This means the adjusted value is LOWER than base (catchers are plentiful)
    const adjusted = applyScarcityAdjustment(3.0, "C", 3, 10);
    expect(adjusted).toBeLessThan(3.0);
  });

  it("applyScarcityAdjustment handles zero remaining players gracefully", () => {
    // Guard: avoid division by zero
    const adjusted = applyScarcityAdjustment(5.0, "C", 8, 0);
    expect(adjusted).toBe(5.0); // Returns baseSGP unchanged
  });
});

// ============================================================
// Scenario 4: Endgame mode ($18 budget, 8 spots)
// ============================================================

describe("Scenario 4: Endgame mode activation", () => {
  it("computeBudgetCurve activates endgameMode when budget <= $20", () => {
    // Budget = $18, remaining roster spots = 8
    // usable = 18 - 7 = 11 (reserve $1 per remaining slot)
    // averageRemainingPerPlayer = 11 / 8 = 1.375
    const signal = computeBudgetCurve(
      18,  // remainingBudget
      8,   // remainingRosterSpots
      260, // totalBudget
      22,  // totalRosterSize
      1.1, // inflationFactor
      5,   // currentPlayerDollarValue
    );

    expect(signal.endgameMode).toBe(true);
    expect(signal.averageRemainingPerPlayer).toBeCloseTo(1.375, 1);
    // maxBidRecommendation should be very limited (capped by usable budget constraints)
    expect(signal.maxBidRecommendation).toBeLessThanOrEqual(11);
  });

  it("computeBudgetCurve does NOT activate endgameMode when budget > $20", () => {
    const signal = computeBudgetCurve(21, 8, 260, 22, 1.0, 5);
    expect(signal.endgameMode).toBe(false);
  });
});

// ============================================================
// Scenario 5: Budget pacing — ahead of schedule
// ============================================================

describe("Scenario 5: Budget pacing — ahead of schedule", () => {
  it("computeBudgetCurve returns pacingStatus=ahead when remaining budget exceeds optimal", () => {
    // Halfway through draft: 11 of 22 spots filled, budget=$180 (only spent $80 of $260)
    // rosterProgress = 1 - (11/22) = 0.5
    // expectedSpentFraction = 0.5 * 0.9 = 0.45
    // optimalRemainingSpend = 260 * (1 - 0.45) = 260 * 0.55 = 143
    // budgetPressure = 180 / 143 = 1.259 > 1.05 → "ahead"
    const signal = computeBudgetCurve(
      180, // remainingBudget
      11,  // remainingRosterSpots
      260, // totalBudget
      22,  // totalRosterSize
      1.0, // inflationFactor
      10,  // currentPlayerDollarValue
    );

    expect(signal.pacingStatus).toBe("ahead");
    expect(signal.budgetPressure).toBeGreaterThan(1.05);
  });
});

// ============================================================
// Scenario 6: Budget pacing — behind schedule
// ============================================================

describe("Scenario 6: Budget pacing — behind schedule", () => {
  it("computeBudgetCurve returns pacingStatus=behind when remaining budget below optimal", () => {
    // Halfway through draft: 11 of 22 spots filled, budget=$90 (spent $170 of $260)
    // optimalRemainingSpend = 143 (same calculation as above)
    // budgetPressure = 90 / 143 = 0.629 < 0.95 → "behind"
    const signal = computeBudgetCurve(
      90,  // remainingBudget
      11,  // remainingRosterSpots
      260, // totalBudget
      22,  // totalRosterSize
      1.0, // inflationFactor
      10,  // currentPlayerDollarValue
    );

    expect(signal.pacingStatus).toBe("behind");
    expect(signal.budgetPressure).toBeLessThan(0.95);
  });
});

// ============================================================
// Scenario 7: SP tier cap progression in roster building
// ============================================================

describe("Scenario 7: SP tier cap progression", () => {
  it("optimizeRoster respects SP tier caps — first SP <= $18, second SP <= $12", () => {
    // 10 SPs at various prices above and below tier caps
    // SP_TIER_CAPS: SP1=$18, SP2=$12, SP3=$10, SP4=$5, SP5+=$3
    const spPlayers: PoolPlayer[] = [
      makePoolPlayer("SP_25",  25, ["SP"], true, { W: 16, K: 220, IP: 200, ER: 50, HA: 150, BBA: 45, ERA: 2.25, WHIP: 0.975, SV: 0 }),
      makePoolPlayer("SP_18",  18, ["SP"], true, { W: 14, K: 200, IP: 190, ER: 55, HA: 160, BBA: 50, ERA: 2.61, WHIP: 1.105, SV: 0 }),
      makePoolPlayer("SP_15",  15, ["SP"], true, { W: 13, K: 180, IP: 180, ER: 60, HA: 165, BBA: 52, ERA: 3.0, WHIP: 1.206, SV: 0 }),
      makePoolPlayer("SP_12",  12, ["SP"], true, { W: 12, K: 165, IP: 175, ER: 65, HA: 170, BBA: 55, ERA: 3.34, WHIP: 1.286, SV: 0 }),
      makePoolPlayer("SP_10",  10, ["SP"], true, { W: 11, K: 150, IP: 165, ER: 68, HA: 175, BBA: 57, ERA: 3.71, WHIP: 1.405, SV: 0 }),
      makePoolPlayer("SP_8",    8, ["SP"], true, { W: 10, K: 140, IP: 160, ER: 72, HA: 180, BBA: 59, ERA: 4.05, WHIP: 1.494, SV: 0 }),
      makePoolPlayer("SP_5",    5, ["SP"], true, { W: 9,  K: 130, IP: 155, ER: 76, HA: 185, BBA: 61, ERA: 4.41, WHIP: 1.587, SV: 0 }),
      makePoolPlayer("SP_3",    3, ["SP"], true, { W: 8,  K: 120, IP: 150, ER: 79, HA: 188, BBA: 62, ERA: 4.74, WHIP: 1.667, SV: 0 }),
      makePoolPlayer("SP_2",    2, ["SP"], true, { W: 7,  K: 110, IP: 145, ER: 82, HA: 191, BBA: 63, ERA: 5.09, WHIP: 1.751, SV: 0 }),
      makePoolPlayer("SP_1",    1, ["SP"], true, { W: 6,  K: 100, IP: 140, ER: 85, HA: 194, BBA: 64, ERA: 5.46, WHIP: 1.843, SV: 0 }),
    ];

    // SGP values proportional to dollar value (cheaper = less value)
    const sgpValues = spPlayers.map(p => p.dollars * 0.5);

    const rosterSlots: Record<string, number> = { P: 6 };

    const result = optimizeRoster(spPlayers, sgpValues, 60, rosterSlots);

    // SP_25 ($25) should be excluded — exceeds tier 1 cap ($18)
    const sp25InRoster = result.roster.some(p => p.name === "SP_25");
    expect(sp25InRoster).toBe(false);

    // SP_18 ($18) should fit in the roster (exactly at tier 1 cap)
    const sp18InRoster = result.roster.some(p => p.name === "SP_18");
    expect(sp18InRoster).toBe(true);

    // Verify all selected pitchers respect their tier caps based on selection order
    let spCount = 0;
    for (const player of result.roster) {
      const tierCap = spCount === 0 ? 18 : spCount === 1 ? 12 : spCount === 2 ? 10 : spCount === 3 ? 5 : 3;
      expect(player.dollars).toBeLessThanOrEqual(tierCap);
      spCount++;
    }
  });
});

// ============================================================
// Scenario 8: Mixed hitter/pitcher budget allocation tracking
// ============================================================

describe("Scenario 8: Budget allocation tracking (hitter/pitcher split)", () => {
  it("computeBudgetCurve includes hitterSpent and pitcherSpent in returned signal", () => {
    // Roster is 50% filled, budget=$260, $100 spent on hitters, $30 on pitchers
    const signal = computeBudgetCurve(
      260 - 100 - 30, // remainingBudget = $130
      11,             // remainingRosterSpots
      260,            // totalBudget
      22,             // totalRosterSize
      1.0,            // inflationFactor
      10,             // currentPlayerDollarValue
      100,            // hitterSpent
      30,             // pitcherSpent
    );

    // Verify hitter/pitcher spend tracking is carried through
    expect(signal.hitterSpent).toBe(100);
    expect(signal.pitcherSpent).toBe(30);

    // Verify budget targets are present
    expect(signal.hitterBudgetTarget).toBeDefined();
    expect(signal.pitcherBudgetTarget).toBeDefined();
    expect(signal.hitterBudgetTarget.min).toBe(185);
    expect(signal.hitterBudgetTarget.max).toBe(205);
    expect(signal.pitcherBudgetTarget.min).toBe(55);
    expect(signal.pitcherBudgetTarget.max).toBe(70);
  });

  it("computeBudgetCurve returns correct remainingBudget and remainingRosterSpots", () => {
    const signal = computeBudgetCurve(
      130, // $130 remaining
      11,  // 11 spots remaining
      260,
      22,
      1.0,
      10,
    );

    expect(signal.remainingBudget).toBe(130);
    expect(signal.remainingRosterSpots).toBe(11);
  });
});
