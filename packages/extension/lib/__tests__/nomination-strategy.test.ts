import { describe, it, expect } from "vitest";
import type { PoolPlayer, SimTeamState, OpponentModel } from "../engine/types";
import { recommendNomination } from "../engine/nomination-strategy";

// ============================================================
// Fixtures / helpers
// ============================================================

function makePlayer(
  name: string,
  dollars: number,
  positions: string[],
  espnAvgSalary?: number,
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: positions.some(p => p === "SP" || p === "RP" || p === "P"),
    positions,
    stats: { HR: 20, R: 80, RBI: 60, AB: 400, H: 110, IP: 0, ER: 0, K: 0, W: 0, SV: 0 },
    espnAvgSalary,
  };
}

function makeTeamState(budget: number, slotsRemaining: Record<string, number>): SimTeamState {
  return {
    budget,
    slotsRemaining,
    categoryTotals: {},
    componentTotals: {},
  };
}

const EMPTY_OPPONENT_MODEL: OpponentModel = {
  teamNeeds: new Map(),
  teamBudgets: new Map(),
  competitionFactors: {},
  leagueInflationFactor: 1.0,
};

// ============================================================
// Tests: recommendNomination
// ============================================================

describe("recommendNomination", () => {
  it("ranks overpriced players higher than fairly-priced players", () => {
    // Player A: ESPN $40, model $10 => overpriced by $30 (high score)
    const playerA = makePlayer("Overpriced Star", 10, ["1B"], 40);
    // Player B: ESPN $15, model $14 => overpriced by $1 (low score)
    const playerB = makePlayer("Fair Value", 14, ["1B"], 15);

    const myTeamState = makeTeamState(100, {}); // no slots needed

    const result = recommendNomination(
      [playerA, playerB],
      [5, 5],
      myTeamState,
      EMPTY_OPPONENT_MODEL,
      [],
      2,
    );

    expect(result.length).toBe(2);
    expect(result[0].playerName).toBe("Overpriced Star");
    expect(result[0].trapScore).toBeGreaterThan(result[1].trapScore);
  });

  it("uses budget drain fallback when espnAvgSalary is undefined", () => {
    // No ESPN ASV, so falls back to dollars/50 * 30 for overpricing
    const expensivePlayer = makePlayer("Expensive No ASV", 40, ["1B"]); // no espnAvgSalary
    const cheapPlayer = makePlayer("Cheap No ASV", 5, ["1B"]);

    const myTeamState = makeTeamState(100, {}); // no slots needed

    const result = recommendNomination(
      [expensivePlayer, cheapPlayer],
      [8, 2],
      myTeamState,
      EMPTY_OPPONENT_MODEL,
      [],
      2,
    );

    expect(result.length).toBe(2);
    // Expensive player should score higher in fallback mode
    expect(result[0].playerName).toBe("Expensive No ASV");
    expect(result[0].trapScore).toBeGreaterThan(result[1].trapScore);
  });

  it("includes overpricing reason when overpricing > 5", () => {
    const player = makePlayer("Overpriced Ace", 10, ["SP"], 25);
    const myTeamState = makeTeamState(100, {});

    const result = recommendNomination(
      [player],
      [5],
      myTeamState,
      EMPTY_OPPONENT_MODEL,
      [],
      5,
    );

    expect(result.length).toBe(1);
    expect(result[0].reason).toContain("Overpriced by $15");
    expect(result[0].reason).toContain("ESPN $25");
    expect(result[0].reason).toContain("model $10");
  });

  it("sorts by trapScore descending", () => {
    // Player A: overpriced, position I don't need => high score
    const playerA = makePlayer("Big Bat", 10, ["1B"], 40);
    // Player B: fairly priced, position I need => low score
    const playerB = makePlayer("Cheap Utility", 5, ["SS"], 6);
    // Player C: moderately overpriced, opponents need => medium score
    const playerC = makePlayer("Mid Pitcher", 15, ["SP"], 30);

    const myTeamState = makeTeamState(100, { SS: 1 }); // I need SS but not 1B or SP

    const opponentStates = Array.from({ length: 10 }, () =>
      makeTeamState(80, { SP: 1 }),
    );

    const sgpValues = [8, 1, 5];

    const result = recommendNomination(
      [playerA, playerB, playerC],
      sgpValues,
      myTeamState,
      EMPTY_OPPONENT_MODEL,
      opponentStates,
      3,
    );

    expect(result.length).toBe(3);

    // Verify sorted descending by trapScore
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].trapScore).toBeGreaterThanOrEqual(result[i + 1].trapScore);
    }

    // All trapScores must be at least 0.01
    for (const rec of result) {
      expect(rec.trapScore).toBeGreaterThanOrEqual(0.01);
    }
  });

  it("returns empty array when no available players", () => {
    const myTeamState = makeTeamState(100, { OF: 2 });
    const result = recommendNomination(
      [],
      [],
      myTeamState,
      EMPTY_OPPONENT_MODEL,
      [],
      5,
    );

    expect(result).toEqual([]);
  });

  it("respects topN limit", () => {
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`Player${i}`, 10 + i * 2, ["OF"], 20 + i * 3),
    );
    const sgpValues = players.map((_, i) => 5 - i * 0.5);
    const myTeamState = makeTeamState(100, { SS: 1 }); // No OF slot needed

    const result = recommendNomination(
      players,
      sgpValues,
      myTeamState,
      EMPTY_OPPONENT_MODEL,
      [],
      3,
    );

    expect(result.length).toBe(3);
  });

  it("boosts score for opponent need and my non-need", () => {
    // Two equally overpriced players, but one at a position opponents need
    const playerNeeded = makePlayer("Needed Closer", 10, ["RP"], 25);
    const playerNotNeeded = makePlayer("Not Needed 1B", 10, ["1B"], 25);

    const myTeamState = makeTeamState(100, {}); // no slots needed (both get non-need bonus)

    // All opponents need RP, none need 1B
    const opponentStates = Array.from({ length: 10 }, () =>
      makeTeamState(80, { RP: 1 }),
    );

    const result = recommendNomination(
      [playerNeeded, playerNotNeeded],
      [5, 5],
      myTeamState,
      EMPTY_OPPONENT_MODEL,
      opponentStates,
      2,
    );

    expect(result.length).toBe(2);
    // playerNeeded should score higher due to opponent need factor
    expect(result[0].playerName).toBe("Needed Closer");
    expect(result[0].trapScore).toBeGreaterThan(result[1].trapScore);
    expect(result[0].reason).toContain("opponents need this position");
  });

  it("penalizes positions I need", () => {
    // Same overpricing, but one is a position I need
    const playerINeed = makePlayer("My SS", 10, ["SS"], 25);
    const playerIDontNeed = makePlayer("Extra 1B", 10, ["1B"], 25);

    const myTeamState = makeTeamState(100, { SS: 1 }); // I need SS

    const result = recommendNomination(
      [playerINeed, playerIDontNeed],
      [5, 5],
      myTeamState,
      EMPTY_OPPONENT_MODEL,
      [],
      2,
    );

    expect(result.length).toBe(2);
    // Player I don't need should rank higher
    expect(result[0].playerName).toBe("Extra 1B");
    expect(result[0].reason).toContain("You don't need this position");
  });

  it("handles slightly overpriced reason string", () => {
    const player = makePlayer("Slight Overprice", 10, ["OF"], 13); // overpriced by $3

    const result = recommendNomination(
      [player],
      [5],
      makeTeamState(100, {}),
      EMPTY_OPPONENT_MODEL,
      [],
      1,
    );

    expect(result.length).toBe(1);
    expect(result[0].reason).toContain("Slightly overpriced");
    expect(result[0].reason).toContain("ESPN $13");
  });
});
