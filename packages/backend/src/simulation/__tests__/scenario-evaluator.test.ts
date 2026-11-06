import { describe, it, expect } from "vitest";
import { evaluateDeterministicScenario } from "../scenario-evaluator.js";
import type { SimulationState, TeamSimInput } from "../types.js";
import type { Category } from "../../../../shared/dist/index.js";

// ─── Test fixtures ────────────────────────────────────────────────────────────

const HITTER_CATEGORIES: Category[] = [
  {
    category_id: "HR",
    name: "Home Runs",
    stat_key: "HR",
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    formula_id: undefined,
  },
  {
    category_id: "RBI",
    name: "RBI",
    stat_key: "RBI",
    type: "COUNTING",
    direction: "HIGHER_BETTER",
    formula_id: undefined,
  },
  {
    category_id: "AVG",
    name: "Batting Average",
    stat_key: "AVG",
    type: "RATE",
    direction: "HIGHER_BETTER",
    formula_id: "avg",
  },
];

// Minimal roster slots that allow test fixtures (2 players per team) to satisfy legality.
// Each test fixture that provides OF + 1B players satisfies { OF: 1, "1B": 1, BN: 3 }.
const ROSTER_SLOTS: Record<string, number> = {
  OF: 1,
  "1B": 1,
  BN: 3,
};

function makeTeam(
  id: number,
  hrPerSeason: number,
  rbiPerSeason: number,
  ab: number,
  h: number,
  roster: Array<{
    playerId: number;
    positions: string[];
    hr: number;
    rbi: number;
    abProj: number;
    hProj: number;
  }> = [],
): TeamSimInput {
  return {
    teamId: id,
    teamName: `Team ${id}`,
    currentBatterComponents: {
      HR: hrPerSeason,
      RBI: rbiPerSeason,
      AB: ab,
      H: h,
    },
    currentPitcherComponents: {},
    roster: roster.map((r) => ({
      playerId: r.playerId,
      positions: r.positions,
      rosterStatus: "active" as const,
      rosterSlot: r.positions[0] ?? "BN",
      projectedComponents: null,
    })),
    playerProjections: new Map(
      roster.map((r) => [
        r.playerId,
        { HR: r.hr, RBI: r.rbi, AB: r.abProj, H: r.hProj } as any,
      ]),
    ),
    gsUsed: 0,
  };
}

function makeState(teams: TeamSimInput[]): SimulationState {
  const seasonEndDate = "2026-10-01";
  return {
    leagueId: 1,
    snapshotDate: "2026-05-01",
    projectionsRunId: 1,
    categories: HITTER_CATEGORIES,
    scoringFormat: "roto",
    rosterSlots: ROSTER_SLOTS,
    gsCap: 200,
    projectionAsOfDate: "2026-05-01",
    seasonStartDate: "2026-03-20",
    seasonEndDate,
    daysRemaining: daysBetween("2026-05-01", seasonEndDate),
    teams,
    degradedReasons: [],
    isViable: true,
  };
}

function daysBetween(from: string, to: string): number {
  const s = new Date(from);
  s.setHours(0, 0, 0, 0);
  const e = new Date(to);
  e.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

// ─── Tests: waiver scoring ────────────────────────────────────────────────────

describe("evaluateDeterministicScenario — waiver mutations", () => {
  it("legal flex replacement yields positive delta for a clearly better player", () => {
    // 3-team league: team 1 has low HR projection; adding a high-HR player via drop
    const teams = [
      makeTeam(1, 20, 60, 200, 50, [
        {
          playerId: 11,
          positions: ["OF"],
          hr: 5,
          rbi: 15,
          abProj: 80,
          hProj: 20,
        }, // the player being dropped
        {
          playerId: 12,
          positions: ["1B"],
          hr: 10,
          rbi: 30,
          abProj: 150,
          hProj: 42,
        },
      ]),
      makeTeam(2, 35, 90, 200, 58, []),
      makeTeam(3, 30, 80, 200, 55, []),
    ];

    const state = makeState(teams);

    // Add a much better OF (playerId=99) by dropping the weak one (playerId=11)
    const result = evaluateDeterministicScenario(state, {
      type: "waiver",
      teamId: 1,
      addPlayerId: 99,
      dropPlayerId: 11,
      addPlayerPositions: ["OF"],
      addPlayerProjection: { HR: 20, RBI: 60, AB: 200, H: 58 },
    });

    expect(result.isLegal).toBe(true);
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.deltaOverallPoints).toBeGreaterThan(0);
  });

  it("illegal swap surfacing blocking issues when no valid slot exists", () => {
    // Team has only 1 OF slot filled — dropping the only eligible OF leaves a gap
    const teams = [
      makeTeam(1, 20, 60, 200, 50, [
        // Only one OF on the roster filling the single OF slot
        {
          playerId: 11,
          positions: ["OF"],
          hr: 10,
          rbi: 30,
          abProj: 150,
          hProj: 42,
        },
        {
          playerId: 12,
          positions: ["C"],
          hr: 5,
          rbi: 20,
          abProj: 80,
          hProj: 22,
        },
      ]),
      makeTeam(2, 35, 90, 200, 58, []),
    ];

    // Override roster slots to have 3 OF slots so dropping the only OF creates a gap
    const state: SimulationState = {
      ...makeState(teams),
      rosterSlots: { ...ROSTER_SLOTS, OF: 3 }, // Need 3 OF but only have 1
    };

    // Drop the only OF and add a SP (wrong type, cannot fill OF slot)
    const result = evaluateDeterministicScenario(state, {
      type: "waiver",
      teamId: 1,
      addPlayerId: 99,
      dropPlayerId: 11,
      addPlayerPositions: ["SP"],
      addPlayerProjection: { IP: 100, ER: 35, BB: 30, K: 120, W: 8 },
    });

    // Should detect roster gaps (3 OF slots needed, only 0 after dropping 11)
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.isLegal).toBe(false);
  });

  it("delta is zero when added player has identical projections to dropped player", () => {
    const teams = [
      makeTeam(1, 20, 60, 200, 50, [
        {
          playerId: 11,
          positions: ["OF"],
          hr: 15,
          rbi: 45,
          abProj: 150,
          hProj: 42,
        },
      ]),
      makeTeam(2, 25, 70, 200, 55, []),
    ];

    const state = makeState(teams);

    const result = evaluateDeterministicScenario(state, {
      type: "waiver",
      teamId: 1,
      addPlayerId: 99,
      dropPlayerId: 11,
      addPlayerPositions: ["OF"],
      // Identical projections — no delta expected
      addPlayerProjection: { HR: 15, RBI: 45, AB: 150, H: 42 },
    });

    expect(result.deltaOverallPoints).toBe(0);
  });
});

// ─── Tests: trade scoring (bilateral) ────────────────────────────────────────

describe("evaluateDeterministicScenario — trade mutations", () => {
  it("bilateral trade returns both user delta and partner delta", () => {
    // Team 1 gives a power hitter (HR) to team 2; receives an average hitter (AVG)
    const teams = [
      makeTeam(1, 30, 90, 300, 90, [
        {
          playerId: 11,
          positions: ["OF"],
          hr: 20,
          rbi: 60,
          abProj: 300,
          hProj: 90,
        }, // giving
        {
          playerId: 12,
          positions: ["1B"],
          hr: 10,
          rbi: 30,
          abProj: 150,
          hProj: 45,
        },
      ]),
      makeTeam(
        2,
        10,
        40,
        300,
        99, // team 2 leads in AVG
        [
          {
            playerId: 21,
            positions: ["SS"],
            hr: 2,
            rbi: 20,
            abProj: 280,
            hProj: 92,
          }, // receiving
          {
            playerId: 22,
            positions: ["OF"],
            hr: 5,
            rbi: 25,
            abProj: 200,
            hProj: 60,
          },
        ],
      ),
      makeTeam(3, 20, 65, 300, 78, []),
    ];

    const state = makeState(teams);

    const result = evaluateDeterministicScenario(state, {
      type: "trade",
      userTeamId: 1,
      partnerTeamId: 2,
      givePlayerIds: [11],
      receivePlayerIds: [21],
    });

    // Both deltas must be defined
    expect(result.deltaOverallPoints).toBeDefined();
    expect(result.partnerDeltaOverallPoints).toBeDefined();

    // The trade should favor one side (power for average — different category strengths)
    // User gives power (HR/RBI), so user delta in HR/RBI should be negative or at best 0
    // Partner gives AVG hitter, so partner loses AVG advantage
    expect(typeof result.deltaOverallPoints).toBe("number");
    expect(typeof result.partnerDeltaOverallPoints).toBe("number");
  });

  it("trade is illegal when post-trade user roster cannot fill required slots", () => {
    const state: SimulationState = {
      ...makeState([
        makeTeam(1, 20, 60, 200, 55, [
          {
            playerId: 11,
            positions: ["C"],
            hr: 5,
            rbi: 15,
            abProj: 100,
            hProj: 28,
          },
        ]),
        makeTeam(2, 25, 70, 200, 58, [
          {
            playerId: 21,
            positions: ["OF"],
            hr: 10,
            rbi: 30,
            abProj: 150,
            hProj: 42,
          },
        ]),
      ]),
      // 1 C slot required
      rosterSlots: { ...ROSTER_SLOTS, C: 1 },
    };

    // Trade away the only C and receive an OF — C slot becomes unfillable
    const result = evaluateDeterministicScenario(state, {
      type: "trade",
      userTeamId: 1,
      partnerTeamId: 2,
      givePlayerIds: [11],
      receivePlayerIds: [21],
    });

    // Post-trade user team has no C; should have gaps
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.isLegal).toBe(false);
  });

  it("summed user + partner deltas approximately equal zero for fair value swaps", () => {
    // If league has only 2 teams and they swap equivalent players,
    // user gains what partner loses and vice versa (zero-sum in roto points)
    const teams = [
      makeTeam(1, 20, 60, 200, 55, [
        {
          playerId: 11,
          positions: ["OF"],
          hr: 15,
          rbi: 45,
          abProj: 200,
          hProj: 58,
        },
      ]),
      makeTeam(2, 20, 60, 200, 55, [
        {
          playerId: 21,
          positions: ["OF"],
          hr: 15,
          rbi: 45,
          abProj: 200,
          hProj: 58,
        },
      ]),
    ];

    const state = makeState(teams);

    // Swap identical players — roto points should be unchanged for both teams
    const result = evaluateDeterministicScenario(state, {
      type: "trade",
      userTeamId: 1,
      partnerTeamId: 2,
      givePlayerIds: [11],
      receivePlayerIds: [21],
    });

    expect(result.deltaOverallPoints).toBe(0);
    expect(result.partnerDeltaOverallPoints).toBe(0);
  });
});
