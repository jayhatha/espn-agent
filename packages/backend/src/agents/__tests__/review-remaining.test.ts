import { describe, expect, it } from "vitest";
import type {
  Category,
  StatComponents,
} from "../../../../shared/dist/index.js";
import { calculateSuggestedFaabBid } from "../faab-tracker.js";
import { RosterSimulator } from "../roster-simulator.js";
import type {
  AllocationInput,
  RosteredPlayer,
} from "../../projection/types.js";
import { assignCompetitionRanks } from "../../utils/roto-ranking.js";

const hrCategory: Category = {
  category_id: "HR",
  stat_key: "HR",
  name: "Home Runs",
  type: "COUNTING",
  direction: "HIGHER_BETTER",
};

const oldPlayer: RosteredPlayer = {
  playerId: 1,
  positions: ["OF"],
  rosterStatus: "active",
  rosterSlot: "OF",
  projectedComponents: null,
};
const newPlayer: RosteredPlayer = {
  playerId: 2,
  positions: ["OF"],
  rosterStatus: "active",
  rosterSlot: null,
  projectedComponents: null,
};
const projections = new Map<number, StatComponents>([
  [1, { AB: 100, HR: 5 }],
  [2, { AB: 200, HR: 20 }],
]);
const allocationInput: AllocationInput = {
  roster: [oldPlayer],
  rosterSlots: { OF: 1 },
  projectionsByPlayerId: projections,
  gsUsed: 0,
  gsCap: null,
  projectionAsOfDate: "2026-06-01",
  snapshotDate: "2026-07-01",
  seasonEndDate: "2026-07-31",
};
const baselineRows = [
  {
    team_id: 1,
    category_id: "HR",
    projected_value: 2.5,
    projected_rank: 2,
    projected_roto_points: 1,
  },
  {
    team_id: 2,
    category_id: "HR",
    projected_value: 10,
    projected_rank: 1,
    projected_roto_points: 2,
  },
];

describe("allocator-backed roster simulation", () => {
  it("prorates a mutated trade roster and awards shared tie points", () => {
    const simulator = new RosterSimulator();
    const result = simulator.simulateTrade(
      {
        categories: [hrCategory],
        teamCategoryMap: new Map([
          [1, new Map([["HR", { value: 2.5, rank: 2, rotoPoints: 1 }]])],
          [2, new Map([["HR", { value: 10, rank: 1, rotoPoints: 2 }]])],
        ]),
        teamId: 1,
        currentCategoryImpacts: [],
        allocationInput,
        currentTotals: [{ category_id: "HR", value: 0, components_json: null }],
        incomingPlayersById: new Map([[2, newPlayer]]),
      },
      {
        givePlayers: [{ playerId: 1, playerName: "Old" }],
        receivePlayers: [{ playerId: 2, playerName: "New" }],
      },
      new Map(),
    );

    expect(result.categoryImpacts[0].projectedValue).toBe(10);
    expect(result.categoryImpacts[0].projectedRank).toBe(1);
    expect(result.categoryImpacts[0].deltaPoints).toBe(0.5);
    expect(result.overallPoints).toBe(1.5);
  });

  it("prorates an add/drop roster and compares stored baseline roto points", () => {
    const simulator = new RosterSimulator();
    const projectionRows = new Map([
      [1, { stat_components_json: projections.get(1) }],
      [2, { stat_components_json: projections.get(2) }],
    ]);
    const result = simulator.simulateAddDrop(
      {
        categories: [hrCategory],
        currentProjections: [baselineRows[0]],
        allTeamsProjections: baselineRows,
        numTeams: 2,
        teamId: 1,
        allocationInput,
        currentTotals: [{ category_id: "HR", value: 0, components_json: null }],
        playersById: new Map([[2, newPlayer]]),
      },
      2,
      1,
      projectionRows,
    );

    expect(result?.deltaOverallPoints).toBe(0.5);
    expect(result?.categoryImpacts[0]).toMatchObject({
      deltaRank: -1,
      deltaPoints: 0.5,
    });
  });
});

describe("FAAB bid model", () => {
  it("scales from normalized league budget and value above replacement", () => {
    const bid = calculateSuggestedFaabBid({
      leagueBudget: 100,
      teamRemaining: 70,
      playerValueAboveReplacement: 20,
      maxValueAboveReplacement: 40,
      categoryLeverage: 1.25,
      competitorRemaining: [90, 80, 50],
      weeksRemaining: 10,
    });

    expect(bid).toBeGreaterThan(1);
    expect(bid).toBeLessThanOrEqual(70);
    const doubledBudgetBid = calculateSuggestedFaabBid({
      leagueBudget: 200,
      teamRemaining: 140,
      playerValueAboveReplacement: 20,
      maxValueAboveReplacement: 40,
      categoryLeverage: 1.25,
      competitorRemaining: [180, 160, 100],
      weeksRemaining: 10,
    });
    expect(doubledBudgetBid).toBeGreaterThanOrEqual(bid * 2 - 1);
    expect(doubledBudgetBid).toBeLessThanOrEqual(bid * 2 + 1);
  });
});

describe("overall competition ranks", () => {
  it("shares rank and skips occupied positions after ties", () => {
    expect(
      assignCompetitionRanks([
        { teamId: 1, points: 20 },
        { teamId: 2, points: 20 },
        { teamId: 3, points: 18 },
      ]).map(({ teamId, rank }) => ({ teamId, rank })),
    ).toEqual([
      { teamId: 1, rank: 1 },
      { teamId: 2, rank: 1 },
      { teamId: 3, rank: 3 },
    ]);
  });
});
