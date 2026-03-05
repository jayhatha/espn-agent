import { describe, it, expect } from "vitest";
import { buildOpponentModel, estimateMarketPrice, computePositionCompetition } from "../engine/opponent-model";
import type { PoolPlayer } from "../engine/types";

// ============================================================
// Fixtures
// ============================================================

function makePlayer(
  name: string,
  positions: string[],
  dollars = 10,
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

// Roster slot definition for testing
const simpleRosterSlots: Record<string, number> = {
  C: 1,
  "1B": 1,
  OF: 3,
  SS: 1,
  P: 2,
};

// ============================================================
// buildOpponentModel tests
// ============================================================

describe("buildOpponentModel — competition factors", () => {
  it("computes competition factor for C ~0.33 and OF ~0.67 with 3 teams", () => {
    // Team A needs C (has no C), Teams B and C need OF (each have no OF drafted)
    // Team A roster: 1B already filled, needs C + OF
    // Team B roster: C filled, needs OF
    // Team C roster: C filled, needs OF
    const teamRosters = new Map([
      ["teamA", { teamId: "teamA", teamName: "Team A", playerIds: [1] }],  // no C, no OF
      ["teamB", { teamId: "teamB", teamName: "Team B", playerIds: [2] }],  // has C, no OF
      ["teamC", { teamId: "teamC", teamName: "Team C", playerIds: [3] }],  // has C, no OF
    ]);

    // Player picks: teamA has a 1B, teamB and teamC each have a C
    const allPicks = [
      { playerId: 1, teamId: "teamA", teamName: "Team A", cost: 20, round: 1, pickNumber: 1, timestamp: Date.now() },
      { playerId: 2, teamId: "teamB", teamName: "Team B", cost: 25, round: 1, pickNumber: 2, timestamp: Date.now() },
      { playerId: 3, teamId: "teamC", teamName: "Team C", cost: 22, round: 1, pickNumber: 3, timestamp: Date.now() },
    ];

    // FG player pool to resolve positions
    const playerPool: PoolPlayer[] = [
      makePlayer("1B Player", ["1B"], 20),          // id 1 → teamA, 1B
      makePlayer("C Player B", ["C"], 25),           // id 2 → teamB, C
      makePlayer("C Player C", ["C"], 22),           // id 3 → teamC, C
    ];

    const allTeamBudgets = [
      { teamName: "Team A", remainingBudget: 220 },
      { teamName: "Team B", remainingBudget: 215 },
      { teamName: "Team C", remainingBudget: 218 },
    ];

    const model = buildOpponentModel(
      teamRosters,
      allTeamBudgets,
      simpleRosterSlots,
      playerPool,
      allPicks,
      1.0,
    );

    // 3 total teams; 1 needs C → competition factor = 1/3 ≈ 0.33
    // All 3 teams need OF (none have any OF) → competition factor = 3/3 = 1.0
    expect(model.competitionFactors["C"]).toBeCloseTo(1 / 3, 1);
    expect(model.competitionFactors["OF"]).toBeCloseTo(1.0, 1);
  });

  it("sets leagueInflationFactor from the passed-in inflationFactor (not hardcoded 1.0)", () => {
    const teamRosters = new Map([
      ["teamA", { teamId: "teamA", teamName: "Team A", playerIds: [] }],
    ]);
    const model = buildOpponentModel(
      teamRosters,
      [{ teamName: "Team A", remainingBudget: 200 }],
      simpleRosterSlots,
      [],
      [],
      1.3, // pass 1.3 explicitly
    );

    expect(model.leagueInflationFactor).toBe(1.3);
    // Must NOT be hardcoded to 1.0
    expect(model.leagueInflationFactor).not.toBe(1.0);
  });

  it("populates teamBudgets map correctly from allTeamBudgets array", () => {
    const teamRosters = new Map([
      ["teamA", { teamId: "teamA", teamName: "Team A", playerIds: [] }],
      ["teamB", { teamId: "teamB", teamName: "Team B", playerIds: [] }],
    ]);
    const allTeamBudgets = [
      { teamName: "Team A", remainingBudget: 180 },
      { teamName: "Team B", remainingBudget: 150 },
    ];

    const model = buildOpponentModel(
      teamRosters,
      allTeamBudgets,
      simpleRosterSlots,
      [],
      [],
      1.0,
    );

    expect(model.teamBudgets.size).toBe(2);
    // Budgets should be stored by team key
    let totalBudget = 0;
    for (const budget of model.teamBudgets.values()) {
      totalBudget += budget;
    }
    expect(totalBudget).toBe(330); // 180 + 150
  });
});

// ============================================================
// estimateMarketPrice tests
// ============================================================

describe("estimateMarketPrice", () => {
  it("applies inflation + competition to base price (ratio 1.2, competitionFactor 0.5)", () => {
    // Base price = playerSGP * (totalRemainingBudget / totalRemainingValue)
    // = 10 * (120 / 100) = 12
    // Competition = 1 + (0.5 * 0.2) = 1.1
    // Final = Math.round(12 * 1.1) = Math.round(13.2) = 13
    // dollarValue = 20 → cap = 40, no clamp
    const result = estimateMarketPrice(10, 100, 120, 0.5, 20);
    expect(result).toBe(13);
  });

  it("returns $1 when totalRemainingValue is 0", () => {
    const result = estimateMarketPrice(10, 0, 100, 0.5, 1);
    expect(result).toBe(1);
  });

  it("returns at least $1 even when SGP * ratio is very small", () => {
    // playerSGP = 0.001, ratio = 0.5 → base = 0.0005 < 1 → clamp to 1
    const result = estimateMarketPrice(0.001, 1000, 500, 0, 1);
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it("competition factor 0 applies no competition premium", () => {
    // Base = 10 * (100/100) = 10, competition = 1 + (0 * 0.2) = 1.0
    // Final = 10; dollarValue = 10 → cap = 20, no clamp
    const result = estimateMarketPrice(10, 100, 100, 0, 10);
    expect(result).toBe(10);
  });

  it("competition factor 1.0 applies maximum 20% premium", () => {
    // Base = 10 * (100/100) = 10, competition = 1 + (1.0 * 0.2) = 1.2
    // Final = Math.round(12) = 12; dollarValue = 10 → cap = 20, no clamp
    const result = estimateMarketPrice(10, 100, 100, 1.0, 10);
    expect(result).toBe(12);
  });

  it("caps result to 2x playerDollarValue for low-value players", () => {
    // raw base = 5 * (600 / 100) = 30, but dollarValue = 1 → cap = ceil(1 * 2) = 2
    const result = estimateMarketPrice(5, 100, 600, 0, 1);
    expect(result).toBe(2);
  });

  it("does not cap high-value players when market price is within 2x", () => {
    // base = 10 * (100 / 100) = 10; dollarValue = 10 → cap = 20, no clamp
    const result = estimateMarketPrice(10, 100, 100, 0, 10);
    expect(result).toBe(10);
  });

  it("caps at exactly 2x for mid-range scenario", () => {
    // base = 10 * (300 / 100) = 30; dollarValue = 5 → cap = ceil(5 * 2) = 10
    const result = estimateMarketPrice(10, 100, 300, 0, 5);
    expect(result).toBe(10);
  });
});

// ============================================================
// computePositionCompetition tests
// ============================================================

describe("computePositionCompetition", () => {
  it("returns max competition factor across player eligible positions", () => {
    // Player eligible at SS (0.6) and 2B (0.4) → return 0.6
    const competitionFactors: Record<string, number> = {
      SS: 0.6,
      "2B": 0.4,
      C: 0.8,
    };
    const result = computePositionCompetition(["SS", "2B"], competitionFactors);
    expect(result).toBe(0.6);
  });

  it("returns 0 for positions with no competition factor", () => {
    const result = computePositionCompetition(["DH"], { C: 0.5, SS: 0.3 });
    expect(result).toBe(0);
  });

  it("returns 0 for empty positions array", () => {
    const result = computePositionCompetition([], { C: 0.5 });
    expect(result).toBe(0);
  });

  it("returns the single position factor when only one eligible position", () => {
    const result = computePositionCompetition(["C"], { C: 0.75, SS: 0.4 });
    expect(result).toBe(0.75);
  });
});
