import { describe, it, expect } from "vitest";
import type { PoolPlayer, SimTeamState, OpponentModel } from "../engine/types";
import { recommendNomination } from "../engine/nomination-strategy";

// ============================================================
// Fixtures / helpers
// ============================================================

function makePlayer(name: string, dollars: number, positions: string[]): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: positions.some(p => p === "SP" || p === "RP" || p === "P"),
    positions,
    stats: { HR: 20, R: 80, RBI: 60, AB: 400, H: 110, IP: 0, ER: 0, K: 0, W: 0, SV: 0 },
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
  it("sorts by trapScore descending", () => {
    // Player A: expensive ($40), position I don't need → high trapScore
    const playerA = makePlayer("Big Bat", 40, ["1B"]);
    // Player B: cheap ($5), position I need → low trapScore
    const playerB = makePlayer("Cheap Utility", 5, ["SS"]);
    // Player C: mid price ($20), position most opponents need → medium trapScore
    const playerC = makePlayer("Mid Pitcher", 20, ["SP"]);

    const myTeamState = makeTeamState(100, {
      // I have SS slot open but not 1B or SP
      SS: 1,
    });

    // 8 of 10 opponents need SP
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
      makePlayer(`Player${i}`, 10 + i * 2, ["OF"]),
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

  it("generates correct reason strings", () => {
    // Test 1: Expensive player at a position I don't need
    const expensivePlayer = makePlayer("Expensive Star", 45, ["1B"]);
    const myTeamNoNeed = makeTeamState(100, { SS: 1 }); // No 1B slot needed

    const result1 = recommendNomination(
      [expensivePlayer],
      [10],
      myTeamNoNeed,
      EMPTY_OPPONENT_MODEL,
      [],
      5,
    );

    expect(result1.length).toBe(1);
    expect(result1[0].reason).toContain("Expensive");
    expect(result1[0].reason).toContain("You don't need this position");

    // Test 2: Cheap player at a position 8 of 10 opponents need
    const cheapTargetedPlayer = makePlayer("Cheap Closer", 3, ["RP"]);
    const myTeamWithRP = makeTeamState(100, { RP: 1 }); // I still need RP
    // 8 of 10 opponents need RP
    const manyOpponentsNeedRP = Array.from({ length: 10 }, (_, i) =>
      i < 8
        ? makeTeamState(80, { RP: 1 }) // needs RP
        : makeTeamState(80, {}),        // doesn't need RP
    );

    const result2 = recommendNomination(
      [cheapTargetedPlayer],
      [1],
      myTeamWithRP,
      EMPTY_OPPONENT_MODEL,
      manyOpponentsNeedRP,
      5,
    );

    expect(result2.length).toBe(1);
    expect(result2[0].reason).toContain("opponents need this position");
  });
});
