import { describe, it, expect } from "vitest";
import type { PoolPlayer, SimDraftState, SimTeamState, CandidateAction } from "../engine/types";
import type { Category } from "@espn-fantasy/shared";
import { compareDecisions, aggregateOutcomes } from "../engine/decision-comparison";

// ============================================================
// Fixtures
// ============================================================

const COUNTING_CATEGORIES: Category[] = [
  { category_id: "hr", name: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "r", name: "R", stat_key: "R", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "rbi", name: "RBI", stat_key: "RBI", type: "COUNTING", direction: "HIGHER_BETTER" },
];

function makeHitter(
  name: string,
  dollars: number,
  positions: string[] = ["OF"],
  hr = 20,
  r = 80,
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: false,
    positions,
    stats: { HR: hr, R: r, RBI: hr * 3, AB: 400, H: 110 },
  };
}

function makePitcher(name: string, dollars: number): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: true,
    positions: ["SP"],
    stats: { IP: 180, ER: 50, HA: 160, BBA: 50, W: 12, SV: 0, K: 180, SO: 180, HR: 0, R: 0, RBI: 0 },
  };
}

function makePlayerPool(size: number): PoolPlayer[] {
  const players: PoolPlayer[] = [];
  const hitPositions = ["OF", "OF", "1B", "SS", "2B", "3B", "C", "OF", "1B", "OF"];
  for (let i = 0; i < size; i++) {
    if (i % 4 === 0) {
      players.push(makePitcher(`SP${i}`, Math.max(1, 20 - i * 0.1)));
    } else {
      const pos = hitPositions[i % hitPositions.length];
      players.push(makeHitter(`H${i}`, Math.max(1, 15 - i * 0.07), [pos], Math.max(1, 20 - i * 0.07)));
    }
  }
  return players;
}

const SIMPLE_ROSTER_SLOTS: Record<string, number> = {
  OF: 2,
  "1B": 1,
  SS: 1,
  P: 2,
};

/**
 * Build a SimDraftState with all teams at initial state (all players available).
 * Mirrors the helper from draft-simulator.test.ts.
 */
function buildSimDraftState(
  players: PoolPlayer[],
  teamCount: number,
  myTeamIndex: number,
  budgetPerTeam: number,
  rosterSlots: Record<string, number>,
): SimDraftState {
  const teamStates: SimTeamState[] = [];
  for (let i = 0; i < teamCount; i++) {
    teamStates.push({
      budget: budgetPerTeam,
      slotsRemaining: { ...rosterSlots },
      categoryTotals: {},
      componentTotals: {},
    });
  }
  return {
    availableIndices: new Set(players.map((_, i) => i)),
    teamStates,
    myTeamIndex,
  };
}

// ============================================================
// Tests: aggregateOutcomes
// ============================================================

describe("aggregateOutcomes", () => {
  it("computes correct winProbability when myTeam finishes 1st in 3 of 10 sims", () => {
    // 10 simulations, 3 teams
    // In sims 0,3,7 — myTeam (index 0) has highest roto pts → rank 1
    const allSimRotoPts: number[][] = [
      [30, 25, 20],  // sim 0: team 0 first ✓
      [20, 30, 25],  // sim 1: team 1 first
      [25, 20, 30],  // sim 2: team 2 first
      [30, 20, 25],  // sim 3: team 0 first ✓
      [20, 25, 30],  // sim 4: team 2 first
      [25, 30, 20],  // sim 5: team 1 first
      [20, 30, 25],  // sim 6: team 1 first
      [30, 20, 25],  // sim 7: team 0 first ✓
      [25, 30, 20],  // sim 8: team 1 first
      [20, 25, 30],  // sim 9: team 2 first
    ];

    const outcome = aggregateOutcomes(0, allSimRotoPts, 3);

    expect(outcome.winProbability).toBeCloseTo(0.3, 2);
    expect(outcome.simCount).toBe(10);
  });

  it("computes correct expectedFinish with known ranks", () => {
    // 5 simulations, 3 teams. myTeam (0) gets these roto pts → these ranks:
    // sim: [30,25,20] → rank 1
    // sim: [20,30,25] → rank 3
    // sim: [25,20,30] → rank 2
    // sim: [25,20,30] → rank 2
    // sim: [20,30,25] → rank 3
    // avg rank = (1+3+2+2+3)/5 = 11/5 = 2.2
    const allSimRotoPts: number[][] = [
      [30, 25, 20],
      [20, 30, 25],
      [25, 20, 30],
      [25, 20, 30],
      [20, 30, 25],
    ];

    const outcome = aggregateOutcomes(0, allSimRotoPts, 3);

    expect(outcome.expectedFinish).toBeCloseTo(2.2, 1);
  });

  it("computes top3Probability correctly", () => {
    // 4 sims, 4 teams. myTeam (0) is rank 1,2,3,4 → top3 in 3 of 4 = 0.75
    const allSimRotoPts: number[][] = [
      [40, 30, 20, 10], // rank 1
      [30, 40, 20, 10], // rank 2
      [20, 30, 40, 10], // rank 3
      [10, 30, 20, 40], // rank 4
    ];

    const outcome = aggregateOutcomes(0, allSimRotoPts, 4);

    expect(outcome.top3Probability).toBeCloseTo(0.75, 2);
  });

  it("handles tie in roto points consistently (rank computed by counting teams with more pts)", () => {
    // If two teams tie, both get the same rank assignment
    const allSimRotoPts: number[][] = [
      [25, 25, 10], // myTeam (0) ties with team 1
    ];

    const outcome = aggregateOutcomes(0, allSimRotoPts, 3);

    // Team 0 has 25 pts. Team 1 also has 25 pts. Team 2 has 10 pts.
    // 0 teams have MORE pts than team 0 → rank 1
    expect(outcome.expectedFinish).toBe(1);
    // rank 1 → win probability = 1.0
    expect(outcome.winProbability).toBe(1.0);
  });

  it("computes expectedRotoPts as mean of myTeam roto pts across sims", () => {
    const allSimRotoPts: number[][] = [
      [10, 5, 3],
      [20, 5, 3],
      [30, 5, 3],
    ];

    const outcome = aggregateOutcomes(0, allSimRotoPts, 3);

    expect(outcome.expectedRotoPts).toBeCloseTo(20, 1); // (10+20+30)/3 = 20
  });

  it("computes non-zero stdDevRotoPts when roto points vary", () => {
    const allSimRotoPts: number[][] = [
      [10, 15, 20],
      [25, 10, 15],
      [15, 25, 10],
    ];

    const outcome = aggregateOutcomes(0, allSimRotoPts, 3);

    expect(outcome.stdDevRotoPts).toBeGreaterThan(0);
  });
});

// ============================================================
// Tests: compareDecisions
// ============================================================

describe("compareDecisions", () => {
  it("returns bid as recommended when high-value star player is affordable", () => {
    // Build a pool where player 0 is a super-star
    const starPlayer = makeHitter("Star", 10, ["OF"], 50, 120); // Very high SGP stats
    const otherPlayers = makePlayerPool(50);
    const players = [starPlayer, ...otherPlayers];
    const sgpValues = [15, ...otherPlayers.map((_, i) => Math.max(0.1, 5 - i * 0.1))];

    const state = buildSimDraftState(players, 6, 0, 100, SIMPLE_ROSTER_SLOTS);

    const candidates: CandidateAction[] = [
      { type: "bid", label: "Bid $10 on Star", playerIndex: 0, bidPrice: 10 },
      { type: "pass", label: "Pass" },
    ];

    const result = compareDecisions(candidates, state, players, sgpValues, COUNTING_CATEGORIES, 100, 1.0);

    // Star player is clearly valuable and affordable → bid recommended
    expect(result.recommendedAction).toBe("Bid $10 on Star");
    expect(result.decisions.length).toBe(2);
    expect(result.computeTimeMs).toBeGreaterThan(0);
  });

  it("returns pass as recommended when overpaying for replacement-level player", () => {
    // Build a pool where player 0 is $1 value (replacement) but we'd bid $25
    const replacementPlayer = makeHitter("Replacement", 1, ["OF"], 1, 5); // Very low stats
    const goodPlayers = makePlayerPool(50);
    const players = [replacementPlayer, ...goodPlayers];
    const sgpValues = [0.01, ...goodPlayers.map((_, i) => Math.max(0.5, 6 - i * 0.12))];

    const state = buildSimDraftState(players, 6, 0, 100, SIMPLE_ROSTER_SLOTS);

    const candidates: CandidateAction[] = [
      { type: "bid", label: "Bid $25 on Replacement", playerIndex: 0, bidPrice: 25 },
      { type: "pass", label: "Pass" },
    ];

    const result = compareDecisions(candidates, state, players, sgpValues, COUNTING_CATEGORIES, 100, 1.0);

    // Overpaying $25 for a near-zero SGP player should lose to passing
    expect(result.recommendedAction).toBe("Pass");
  });

  it("returns correct structure with decisions array matching input length", () => {
    const players = makePlayerPool(40);
    const sgpValues = players.map((_, i) => Math.max(0.1, 5 - i * 0.12));
    const state = buildSimDraftState(players, 4, 0, 80, SIMPLE_ROSTER_SLOTS);

    const candidates: CandidateAction[] = [
      { type: "bid", label: "Bid $15 on P0", playerIndex: 0, bidPrice: 15 },
      { type: "pass", label: "Pass" },
    ];

    const result = compareDecisions(candidates, state, players, sgpValues, COUNTING_CATEGORIES, 50, 1.0);

    // Structural correctness
    expect(result.decisions.length).toBe(2);
    expect(result.decisions[0].label).toBe("Bid $15 on P0");
    expect(result.decisions[1].label).toBe("Pass");

    for (const d of result.decisions) {
      expect(d.outcome).toBeDefined();
      expect(typeof d.outcome.winProbability).toBe("number");
      expect(typeof d.outcome.expectedFinish).toBe("number");
      expect(typeof d.outcome.top3Probability).toBe("number");
      expect(typeof d.outcome.top6Probability).toBe("number");
      expect(typeof d.outcome.expectedRotoPts).toBe("number");
      expect(typeof d.outcome.stdDevRotoPts).toBe("number");
      expect(d.outcome.simCount).toBe(50);
    }

    expect(typeof result.recommendedAction).toBe("string");
    expect(candidates.map(c => c.label)).toContain(result.recommendedAction);
    expect(result.computeTimeMs).toBeGreaterThan(0);
  });

  it("handles empty candidates — returns empty decisions array with computeTimeMs", () => {
    const players = makePlayerPool(20);
    const sgpValues = players.map((_, i) => Math.max(0.1, 3 - i * 0.1));
    const state = buildSimDraftState(players, 3, 0, 60, SIMPLE_ROSTER_SLOTS);

    const result = compareDecisions([], state, players, sgpValues, COUNTING_CATEGORIES, 20, 1.0);

    expect(result.decisions.length).toBe(0);
    expect(result.recommendedAction).toBe("");
    expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("recommendedAction is the decision with highest winProbability", () => {
    const players = makePlayerPool(30);
    const sgpValues = players.map((_, i) => Math.max(0.1, 4 - i * 0.13));
    const state = buildSimDraftState(players, 3, 0, 70, SIMPLE_ROSTER_SLOTS);

    const candidates: CandidateAction[] = [
      { type: "bid", label: "Option A", playerIndex: 0, bidPrice: 10 },
      { type: "pass", label: "Option B" },
    ];

    const result = compareDecisions(candidates, state, players, sgpValues, COUNTING_CATEGORIES, 50, 1.0);

    // recommended action should match the decision with highest winProbability
    const bestDecision = result.decisions.reduce((best, d) =>
      d.outcome.winProbability > best.outcome.winProbability ? d : best
    );
    expect(result.recommendedAction).toBe(bestDecision.label);
  });
});
