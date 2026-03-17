import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PoolPlayer } from "../engine/types";
import type { Category } from "@espn-fantasy/shared";
import {
  simulateFullDraft,
  cloneSimState,
  computeSimStandings,
  softmaxSelect,
  draftPlayerToTeam,
} from "../engine/draft-simulator";
import type { SimDraftState, SimTeamState } from "../engine/types";

// ============================================================
// Fixtures
// ============================================================

const COUNTING_CATEGORIES: Category[] = [
  { category_id: "hr", name: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "r", name: "R", stat_key: "R", type: "COUNTING", direction: "HIGHER_BETTER" },
];

const LOWER_BETTER_CATEGORIES: Category[] = [
  { category_id: "era", name: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", formula_id: "era" },
];

const MIXED_CATEGORIES: Category[] = [
  { category_id: "hr", name: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "era", name: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", formula_id: "era" },
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
    stats: { HR: hr, R: r, AB: 400, H: 110 },
  };
}

function makePitcher(
  name: string,
  dollars: number,
  er = 50,
  ip = 180,
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: true,
    positions: ["SP"],
    stats: { IP: ip, ER: er, HA: 160, BBA: 50, W: 12, SV: 0, K: 180, SO: 180 },
  };
}

/** Build a realistic player pool of hitters and pitchers */
function makePlayerPool(size: number): PoolPlayer[] {
  const players: PoolPlayer[] = [];
  const hitPositions = ["OF", "OF", "OF", "1B", "SS", "2B", "3B", "C", "1B", "OF"];
  for (let i = 0; i < size; i++) {
    if (i % 3 === 0) {
      players.push(makePitcher(`SP${i}`, Math.max(1, 30 - i * 0.2), 40 + i * 0.1, 180 - i * 0.1));
    } else {
      const pos = hitPositions[i % hitPositions.length];
      players.push(makeHitter(`Player${i}`, Math.max(1, 35 - i * 0.2), [pos], Math.max(1, 25 - i * 0.1), Math.max(1, 90 - i * 0.3)));
    }
  }
  return players;
}

/** Build simple roster slots (23 total per team) */
const FULL_ROSTER_SLOTS: Record<string, number> = {
  C: 1,
  "1B": 1,
  "2B": 1,
  SS: 1,
  "3B": 1,
  CI: 1,
  MI: 1,
  OF: 4,
  UTIL: 3,
  P: 9,
};

function totalSlots(slots: Record<string, number>): number {
  return Object.values(slots).reduce((s, v) => s + v, 0);
}

/** Build a SimDraftState with all teams at initial state (all players available) */
function buildSimDraftState(
  playerCount: number,
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
    availableIndices: new Set(Array.from({ length: playerCount }, (_, i) => i)),
    teamStates,
    myTeamIndex,
  };
}

// ============================================================
// Tests: simulateFullDraft
// ============================================================

describe("simulateFullDraft — completes all rosters", () => {
  it("fills all roster slots for 12 teams with sufficiently large player pool", () => {
    // Pool must significantly exceed total slots: 12 teams * 23 slots = 276 players minimum
    // Use 400 to ensure enough position-eligible players exist for every slot type
    const players = makePlayerPool(400);
    const sgpValues = players.map((_, i) => Math.max(0.01, 10 - i * 0.025));
    const state = buildSimDraftState(400, 12, 0, 260, FULL_ROSTER_SLOTS);

    const completed = simulateFullDraft(players, sgpValues, COUNTING_CATEGORIES, state, 1.0);

    // Every team should have 0 slots remaining (pool has enough players for all positions)
    for (const team of completed.teamStates) {
      const remaining = Object.values(team.slotsRemaining).reduce((s, v) => s + v, 0);
      expect(remaining).toBe(0);
    }
  });

  it("does not go negative budget for any team", () => {
    const players = makePlayerPool(400);
    const sgpValues = players.map((_, i) => Math.max(0.01, 10 - i * 0.025));
    const state = buildSimDraftState(400, 12, 0, 260, FULL_ROSTER_SLOTS);

    const completed = simulateFullDraft(players, sgpValues, COUNTING_CATEGORIES, state, 1.0);

    for (const team of completed.teamStates) {
      expect(team.budget).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("softmaxSelect", () => {
  it("returns an index that is in the available set", () => {
    const players = makePlayerPool(20);
    const sgpValues = players.map((_, i) => (20 - i) * 0.5);
    const available = new Set(players.map((_, i) => i));
    const team: SimTeamState = {
      budget: 100,
      slotsRemaining: { OF: 2, "1B": 1, SS: 1, SP: 4 },
      categoryTotals: {},
      componentTotals: {},
    };

    const idx = softmaxSelect(available, players, sgpValues, team, 1.0);
    expect(available.has(idx) || idx === -1).toBe(true);
  });

  it("returns -1 when available set is empty", () => {
    const players = makePlayerPool(5);
    const sgpValues = players.map(() => 1.0);
    const available = new Set<number>(); // empty
    const team: SimTeamState = {
      budget: 100,
      slotsRemaining: { OF: 1 },
      categoryTotals: {},
      componentTotals: {},
    };

    const idx = softmaxSelect(available, players, sgpValues, team, 1.0);
    expect(idx).toBe(-1);
  });

  it("returns -1 when all players are too expensive", () => {
    const players = [makeHitter("Rich", 200, ["OF"])];
    const sgpValues = [10];
    const available = new Set([0]);
    const team: SimTeamState = {
      budget: 5, // Can't afford $200 player
      slotsRemaining: { OF: 1 },
      categoryTotals: {},
      componentTotals: {},
    };

    const idx = softmaxSelect(available, players, sgpValues, team, 1.0);
    expect(idx).toBe(-1);
  });

  it("with low temperature, top SGP player wins majority of selections", () => {
    // Player 0 has highest SGP by a lot — at very low temperature, should win almost always
    const players = [
      makeHitter("Star", 10, ["OF"]),
      makeHitter("Bad1", 5, ["OF"]),
      makeHitter("Bad2", 5, ["OF"]),
      makeHitter("Bad3", 5, ["OF"]),
      makeHitter("Bad4", 5, ["OF"]),
    ];
    const sgpValues = [20, 1, 1, 1, 1]; // Star has 20x the SGP of others
    const available = new Set([0, 1, 2, 3, 4]);
    const team: SimTeamState = {
      budget: 50,
      slotsRemaining: { OF: 3 },
      categoryTotals: {},
      componentTotals: {},
    };

    let starCount = 0;
    const runs = 100;
    for (let i = 0; i < runs; i++) {
      const idx = softmaxSelect(new Set([0, 1, 2, 3, 4]), players, sgpValues, team, 0.1);
      if (idx === 0) starCount++;
    }

    // With temp=0.1, star should win the vast majority
    expect(starCount).toBeGreaterThan(80);
  });
});

describe("computeSimStandings", () => {
  it("assigns correct roto points for 3 teams with 2 counting categories", () => {
    // Team 0: HR=30, R=100 → ranks 1st in both → 3+3=6 pts
    // Team 1: HR=20, R=80  → ranks 2nd in both → 2+2=4 pts
    // Team 2: HR=10, R=60  → ranks 3rd in both → 1+1=2 pts
    const teamStates: SimTeamState[] = [
      { budget: 0, slotsRemaining: {}, categoryTotals: { HR: 30, R: 100 }, componentTotals: {} },
      { budget: 0, slotsRemaining: {}, categoryTotals: { HR: 20, R: 80 }, componentTotals: {} },
      { budget: 0, slotsRemaining: {}, categoryTotals: { HR: 10, R: 60 }, componentTotals: {} },
    ];

    const pts = computeSimStandings(teamStates, COUNTING_CATEGORIES);

    expect(pts[0]).toBe(6); // best in both
    expect(pts[1]).toBe(4);
    expect(pts[2]).toBe(2); // worst in both
  });

  it("handles LOWER_BETTER categories (team with lowest ERA gets most pts)", () => {
    // ERA = 9*ER/IP
    // Team 0: ERA = 9*50/180 = 2.5  → best (lowest) → 3 pts
    // Team 1: ERA = 9*80/180 = 4.0  → middle → 2 pts
    // Team 2: ERA = 9*110/180 = 5.5 → worst (highest) → 1 pt
    const teamStates: SimTeamState[] = [
      { budget: 0, slotsRemaining: {}, categoryTotals: {}, componentTotals: { IP: 180, ER: 50, HA: 150, BBA: 50 } },
      { budget: 0, slotsRemaining: {}, categoryTotals: {}, componentTotals: { IP: 180, ER: 80, HA: 160, BBA: 60 } },
      { budget: 0, slotsRemaining: {}, categoryTotals: {}, componentTotals: { IP: 180, ER: 110, HA: 180, BBA: 70 } },
    ];

    const pts = computeSimStandings(teamStates, LOWER_BETTER_CATEGORIES);

    expect(pts[0]).toBe(3); // lowest ERA → most points
    expect(pts[1]).toBe(2);
    expect(pts[2]).toBe(1); // highest ERA → least points
  });

  it("handles zero-IP teams (pushed to bottom for ERA)", () => {
    const teamStates: SimTeamState[] = [
      { budget: 0, slotsRemaining: {}, categoryTotals: {}, componentTotals: { IP: 0, ER: 0 } },
      { budget: 0, slotsRemaining: {}, categoryTotals: {}, componentTotals: { IP: 180, ER: 50, HA: 150, BBA: 50 } },
    ];

    const pts = computeSimStandings(teamStates, LOWER_BETTER_CATEGORIES);
    // Team with IP=0 should be pushed to bottom (worst)
    expect(pts[1]).toBeGreaterThan(pts[0]);
  });
});

describe("cloneSimState", () => {
  it("produces an independent copy — mutating clone does not affect original", () => {
    const original = buildSimDraftState(10, 3, 0, 100, { OF: 2, "1B": 1 });
    const clone = cloneSimState(original);

    // Mutate clone
    clone.availableIndices.delete(0);
    clone.teamStates[0].budget = 999;
    clone.teamStates[0].slotsRemaining["OF"] = 99;

    // Original must be unchanged
    expect(original.availableIndices.has(0)).toBe(true);
    expect(original.teamStates[0].budget).toBe(100);
    expect(original.teamStates[0].slotsRemaining["OF"]).toBe(2);
  });
});

describe("draftPlayerToTeam", () => {
  it("removes player from available indices and decrements budget", () => {
    const players = [makeHitter("Star", 25, ["OF"]), makeHitter("Other", 10, ["1B"])];
    const state = buildSimDraftState(2, 2, 0, 100, { OF: 2, "1B": 1 });

    draftPlayerToTeam(state, 0, 0, players);

    expect(state.availableIndices.has(0)).toBe(false);
    expect(state.teamStates[0].budget).toBe(75); // 100 - 25
  });

  it("decrements slotsRemaining and updates categoryTotals", () => {
    const players = [makeHitter("Star", 25, ["OF"])];
    players[0].stats.HR = 30;
    players[0].stats.R = 90;
    const state = buildSimDraftState(1, 1, 0, 100, { OF: 2, "1B": 1 });

    draftPlayerToTeam(state, 0, 0, players);

    // OF slot decremented
    expect(state.teamStates[0].slotsRemaining["OF"]).toBe(1);
    // Counting stats updated
    expect(state.teamStates[0].categoryTotals["HR"]).toBe(30);
    expect(state.teamStates[0].categoryTotals["R"]).toBe(90);
  });
});

describe("simulateFullDraft — performance", () => {
  it("300 sims * 12 teams * 100 remaining picks completes under 15 seconds", () => {
    const players = makePlayerPool(200);
    const sgpValues = players.map((_, i) => Math.max(0.01, 10 - i * 0.05));

    // Start with 100 remaining picks total (each team has partial roster, ~8 slots each)
    const partialSlots: Record<string, number> = {
      OF: 3,
      "1B": 1,
      SS: 1,
      P: 4,
    };
    // Mark first 100 players as already drafted (simulate ~9 picks per 12-team league)
    const state = buildSimDraftState(200, 12, 0, 180, partialSlots);
    // Remove first 100 indices from available (already drafted)
    for (let i = 0; i < 100; i++) {
      state.availableIndices.delete(i);
    }

    const start = performance.now();
    for (let s = 0; s < 300; s++) {
      simulateFullDraft(players, sgpValues, COUNTING_CATEGORIES, state, 1.0);
    }
    const elapsed = performance.now() - start;

    // 300 full-draft sims with 200-player pool × 12 teams ≈ 52,800 simulated picks.
    // Observed runtime ~8.1s. 15s threshold provides 2x headroom for CI variability.
    expect(elapsed).toBeLessThan(15000);
  });

  it("simulation variation produces non-zero stdDev across outcomes", () => {
    const players = makePlayerPool(100);
    const sgpValues = players.map((_, i) => Math.max(0.01, 8 - i * 0.08));
    const rotoPts: number[] = [];

    for (let s = 0; s < 20; s++) {
      const state = buildSimDraftState(100, 6, 0, 150, { OF: 2, "1B": 1, SS: 1, P: 3 });
      const completed = simulateFullDraft(players, sgpValues, COUNTING_CATEGORIES, state, 1.0);
      const pts = computeSimStandings(completed.teamStates, COUNTING_CATEGORIES);
      rotoPts.push(pts[0]);
    }

    const mean = rotoPts.reduce((s, v) => s + v, 0) / rotoPts.length;
    const variance = rotoPts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / rotoPts.length;
    const stdDev = Math.sqrt(variance);

    // Non-zero stdDev confirms variation across sims
    expect(stdDev).toBeGreaterThan(0);
  });
});
