import { describe, it, expect } from "vitest";
import { computeShoppingList, computePositionPriority } from "../engine/shopping-list";
import type { PoolPlayer, EnhancedScarcitySignal, OpponentModel } from "../engine/types";

// ============================================================
// Fixtures
// ============================================================

function makeHitter(
  name: string,
  stats: Record<string, number> = {},
  dollars = 20,
  positions: string[] = ["OF"],
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: false,
    positions,
    stats: {
      HR: 20, R: 75, RBI: 75, SB: 5, AVG: 0.27,
      AB: 480, H: 130, BB: 45, HBP: 4, SF: 4, TB: 200, PA: 530,
      ...stats,
    },
  };
}

function makePitcher(
  name: string,
  stats: Record<string, number> = {},
  dollars = 15,
  positions: string[] = ["SP"],
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher: true,
    positions,
    stats: {
      W: 12, SV: 0, ERA: 3.80, WHIP: 1.20, K: 180,
      IP: 180, HA: 165, ER: 76, BBA: 51, QS: 20, HRA: 20,
      ...stats,
    },
  };
}

function makeScarcitySignal(position: string, scarcityIndex: number): EnhancedScarcitySignal {
  return {
    position,
    supply: 5,
    demand: 8,
    totalAvailable: 20,
    tierDropValue: 5,
    scarcityIndex,
    myTeamNeeds: true,
  };
}

function makeOpponentModel(budget = 200): OpponentModel {
  const teamBudgets = new Map<string, number>();
  teamBudgets.set("team1", budget);
  teamBudgets.set("team2", budget);
  return {
    teamNeeds: new Map(),
    teamBudgets,
    competitionFactors: { SS: 0.5, OF: 0.3, "1B": 0.2, SP: 0.4, RP: 0.3 },
    leagueInflationFactor: 1.0,
  };
}

// ============================================================
// Test 1: Basic position grouping (TARG-01)
// ============================================================

describe("computeShoppingList — basic position grouping (TARG-01)", () => {
  it("returns 3 position groups for 2 SS, 2 OF, 2 1B players when all positions are needed", () => {
    const players: PoolPlayer[] = [
      makeHitter("SS1", { HR: 15 }, 18, ["SS"]),
      makeHitter("SS2", { HR: 10 }, 12, ["SS"]),
      makeHitter("OF1", { HR: 25 }, 30, ["OF"]),
      makeHitter("OF2", { HR: 20 }, 22, ["OF"]),
      makeHitter("1B1", { HR: 28 }, 35, ["1B"]),
      makeHitter("1B2", { HR: 22 }, 25, ["1B"]),
    ];
    const sgpValues = [3.0, 2.0, 5.0, 4.0, 6.0, 4.5];

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { SS: 1, OF: 3, "1B": 1 },
      remainingSlots: { SS: 1, OF: 3, "1B": 1 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    expect(result.positionGroups).toHaveLength(3);

    const positions = result.positionGroups.map(g => g.position);
    expect(positions).toContain("SS");
    expect(positions).toContain("OF");
    expect(positions).toContain("1B");
  });

  it("sorts players within each group by adjustedSgp descending", () => {
    const players: PoolPlayer[] = [
      makeHitter("SS1", {}, 18, ["SS"]),  // sgp 2.0
      makeHitter("SS2", {}, 12, ["SS"]),  // sgp 5.0 — higher SGP
    ];
    const sgpValues = [2.0, 5.0];  // SS2 has higher SGP

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { SS: 1 },
      remainingSlots: { SS: 1 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    const ssGroup = result.positionGroups.find(g => g.position === "SS")!;
    expect(ssGroup).toBeDefined();
    expect(ssGroup.targets[0].playerName).toBe("SS2");  // higher SGP first
    expect(ssGroup.targets[1].playerName).toBe("SS1");
  });
});

// ============================================================
// Test 2: Multi-position eligibility (TARG-05)
// ============================================================

describe("computeShoppingList — multi-position eligibility (TARG-05)", () => {
  it("player with [1B, 3B] appears in both 1B and 3B groups when both needed", () => {
    const players: PoolPlayer[] = [
      makeHitter("Versatile", {}, 25, ["1B", "3B"]),
      makeHitter("Only1B", {}, 20, ["1B"]),
      makeHitter("Only3B", {}, 18, ["3B"]),
    ];
    const sgpValues = [4.0, 3.0, 2.5];

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { "1B": 1, "3B": 1 },
      remainingSlots: { "1B": 1, "3B": 1 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    const group1B = result.positionGroups.find(g => g.position === "1B")!;
    const group3B = result.positionGroups.find(g => g.position === "3B")!;

    expect(group1B).toBeDefined();
    expect(group3B).toBeDefined();

    const names1B = group1B.targets.map(t => t.playerName);
    const names3B = group3B.targets.map(t => t.playerName);

    expect(names1B).toContain("Versatile");
    expect(names3B).toContain("Versatile");
  });
});

// ============================================================
// Test 3: Filled positions excluded (PRIO-02)
// ============================================================

describe("computeShoppingList — filled positions excluded (PRIO-02)", () => {
  it("no OF group appears when needByPosition has OF: 0", () => {
    const players: PoolPlayer[] = [
      makeHitter("SS1", {}, 18, ["SS"]),
      makeHitter("OF1", {}, 25, ["OF"]),
      makeHitter("OF2", {}, 20, ["OF"]),
    ];
    const sgpValues = [3.0, 4.0, 3.5];

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { SS: 1, OF: 0 },
      remainingSlots: { SS: 1 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    const positions = result.positionGroups.map(g => g.position);
    expect(positions).not.toContain("OF");
    expect(positions).toContain("SS");
  });

  it("returns empty groups when needByPosition is empty", () => {
    const players: PoolPlayer[] = [
      makeHitter("OF1", {}, 25, ["OF"]),
    ];
    const sgpValues = [4.0];

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: {},
      remainingSlots: {},
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    expect(result.positionGroups).toHaveLength(0);
    expect(result.totalTargets).toBe(0);
  });
});

// ============================================================
// Test 4: Priority scoring order (TARG-03, PRIO-01)
// ============================================================

describe("computeShoppingList — priority scoring order (TARG-03, PRIO-01)", () => {
  it("SS with high scarcity (0.8) and 1 slot ranks ahead of OF with low scarcity (0.1) and 3 slots", () => {
    const players: PoolPlayer[] = [
      makeHitter("SS1", {}, 18, ["SS"]),
      makeHitter("OF1", {}, 25, ["OF"]),
      makeHitter("OF2", {}, 20, ["OF"]),
      makeHitter("OF3", {}, 15, ["OF"]),
    ];
    const sgpValues = [3.0, 4.0, 3.5, 3.0];

    // SS priority: scarcity=0.8*0.4 + slotWeight=(1/3)*0.35 + budgetFit=1.0*0.25 = 0.32 + 0.117 + 0.25 = 0.687
    // OF priority: scarcity=0.1*0.4 + slotWeight=(3/3)*0.35 + budgetFit=1.0*0.25 = 0.04 + 0.35 + 0.25 = 0.64
    // SS should rank first

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { SS: 1, OF: 3 },
      remainingSlots: { SS: 1, OF: 3 },
      scarcitySignals: [
        makeScarcitySignal("SS", 0.8),
        makeScarcitySignal("OF", 0.1),
      ],
      opponentModel: makeOpponentModel(),
      myBudget: 200,  // large budget so all targets are affordable (budgetFit ~1)
      weakCategories: new Set(),
    });

    const ssGroup = result.positionGroups.find(g => g.position === "SS")!;
    const ofGroup = result.positionGroups.find(g => g.position === "OF")!;

    expect(ssGroup).toBeDefined();
    expect(ofGroup).toBeDefined();

    // SS should have higher priority score
    expect(ssGroup.priorityScore).toBeGreaterThan(ofGroup.priorityScore);

    // SS group should come first in sorted output
    expect(result.positionGroups[0].position).toBe("SS");
  });
});

// ============================================================
// Test 5: Budget fit affects priority (PRIO-01)
// ============================================================

describe("computeShoppingList — budget fit affects priority (PRIO-01)", () => {
  it("position where all targets affordable ranks higher than one where none are affordable (same scarcity and slots)", () => {
    // With myBudget = 20:
    //   - budgetThreshold = 20 * 0.4 = 8
    //   - SS players have dollarValue 5 → affordable (5 <= 8)
    //   - OF players have dollarValue 30 → NOT affordable (30 > 8)
    const players: PoolPlayer[] = [
      makeHitter("SS1", {}, 5, ["SS"]),
      makeHitter("SS2", {}, 5, ["SS"]),
      makeHitter("SS3", {}, 5, ["SS"]),
      makeHitter("OF1", {}, 30, ["OF"]),
      makeHitter("OF2", {}, 30, ["OF"]),
      makeHitter("OF3", {}, 30, ["OF"]),
    ];
    const sgpValues = [2.0, 1.8, 1.6, 4.0, 3.5, 3.0];

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { SS: 1, OF: 1 },
      remainingSlots: { SS: 1, OF: 1 },
      scarcitySignals: [
        makeScarcitySignal("SS", 0.5),  // same scarcity
        makeScarcitySignal("OF", 0.5),  // same scarcity
      ],
      opponentModel: makeOpponentModel(5), // small team budgets
      myBudget: 20,
      weakCategories: new Set(),
    });

    const ssGroup = result.positionGroups.find(g => g.position === "SS")!;
    const ofGroup = result.positionGroups.find(g => g.position === "OF")!;

    expect(ssGroup).toBeDefined();
    expect(ofGroup).toBeDefined();

    // SS should have higher budgetFit score
    expect(ssGroup.budgetFit).toBeGreaterThan(ofGroup.budgetFit);
    // SS should rank higher (comes first)
    expect(ssGroup.priorityScore).toBeGreaterThan(ofGroup.priorityScore);
  });
});

// ============================================================
// Test 6: Per-target pricing (TARG-02)
// ============================================================

describe("computeShoppingList — per-target pricing (TARG-02)", () => {
  it("each target has expectedMarketPrice > 0, maxBid > 0, and valueSurplus = maxBid - expectedMarketPrice", () => {
    const players: PoolPlayer[] = [
      makeHitter("SS1", {}, 20, ["SS"]),
      makeHitter("SS2", {}, 15, ["SS"]),
    ];
    const sgpValues = [4.0, 3.0];

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { SS: 1 },
      remainingSlots: { SS: 1 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    const ssGroup = result.positionGroups.find(g => g.position === "SS")!;
    expect(ssGroup).toBeDefined();

    for (const target of ssGroup.targets) {
      expect(target.expectedMarketPrice).toBeGreaterThan(0);
      expect(target.maxBid).toBeGreaterThan(0);
      expect(target.valueSurplus).toBe(target.maxBid - target.expectedMarketPrice);
    }
  });
});

// ============================================================
// Test 7: Top N cap
// ============================================================

describe("computeShoppingList — top N cap", () => {
  it("with topN=2, each group has at most 2 targets even if 5 players eligible", () => {
    const players: PoolPlayer[] = [
      makeHitter("SS1", {}, 20, ["SS"]),
      makeHitter("SS2", {}, 18, ["SS"]),
      makeHitter("SS3", {}, 15, ["SS"]),
      makeHitter("SS4", {}, 12, ["SS"]),
      makeHitter("SS5", {}, 8, ["SS"]),
    ];
    const sgpValues = [5.0, 4.0, 3.0, 2.0, 1.0];

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { SS: 1 },
      remainingSlots: { SS: 1 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
      topN: 2,
    });

    const ssGroup = result.positionGroups.find(g => g.position === "SS")!;
    expect(ssGroup).toBeDefined();
    expect(ssGroup.targets).toHaveLength(2);
  });
});

// ============================================================
// Test 8: Empty player pool
// ============================================================

describe("computeShoppingList — empty player pool", () => {
  it("returns empty positionGroups and totalTargets = 0 when allPlayers is empty", () => {
    const result = computeShoppingList({
      allPlayers: [],
      sgpValues: [],
      needByPosition: { SS: 1, OF: 3 },
      remainingSlots: { SS: 1, OF: 3 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    expect(result.positionGroups).toHaveLength(0);
    expect(result.totalTargets).toBe(0);
    expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// Test 9: Pitcher positions mapped to P group
// ============================================================

describe("computeShoppingList — pitcher P group (TARG-01)", () => {
  it("SP and RP players appear in P group when remainingSlots has P and needByPosition lacks SP/RP", () => {
    const players: PoolPlayer[] = [
      makePitcher("SP1", {}, 25, ["SP"]),
      makePitcher("RP1", {}, 15, ["RP"]),
      makeHitter("OF1", {}, 20, ["OF"]),
    ];
    const sgpValues = [4.0, 2.5, 3.5];

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: {},  // no SP/RP in needByPosition
      remainingSlots: { P: 2, OF: 1 },  // P slot triggers pitcher group
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    // Need to also pass P in needByPosition via the expansion logic
    // But per the plan: the pitcher group is triggered by remainingSlots P > 0
    // when needByPosition lacks SP/RP keys. The current implementation adds "P"
    // to positionsToGroup when hasPitcherP && !hasSP && !hasRP.
    // However with needByPosition: {}, positionsToGroup starts empty,
    // but the P check adds "P". Let me verify the group exists.
    const pGroup = result.positionGroups.find(g => g.position === "P");
    expect(pGroup).toBeDefined();
    if (pGroup) {
      const names = pGroup.targets.map(t => t.playerName);
      expect(names).toContain("SP1");
      expect(names).toContain("RP1");
    }
  });
});

// ============================================================
// Test 10: computePositionPriority unit test
// ============================================================

describe("computePositionPriority — formula verification", () => {
  it("correctly computes priority = scarcity*0.4 + slotWeight*0.35 + budgetFit*0.25", () => {
    // scarcityIndex = 0.6, unfilledSlots = 2, affordableCount = 2, totalTargets = 3
    // slotWeight = min(1.0, 2/3) = 0.667
    // budgetFit = 2/3 = 0.667
    // priority = 0.6*0.4 + 0.667*0.35 + 0.667*0.25
    //          = 0.24 + 0.233 + 0.167
    //          = 0.64 (approx)
    const result = computePositionPriority(0.6, 2, 2, 3);
    const slotWeight = Math.min(1.0, 2 / 3);
    const budgetFit = 2 / 3;
    const expected = 0.6 * 0.4 + slotWeight * 0.35 + budgetFit * 0.25;
    expect(result).toBeCloseTo(expected, 5);
  });

  it("returns 0 when all inputs are 0", () => {
    expect(computePositionPriority(0, 0, 0, 0)).toBe(0);
  });

  it("returns 1.0 when scarcity=1, unfilledSlots=3+, and all targets affordable", () => {
    // scarcity=1*0.4 + slotWeight=1.0*0.35 + budgetFit=1.0*0.25 = 1.0
    const result = computePositionPriority(1.0, 5, 3, 3);
    expect(result).toBeCloseTo(1.0, 5);
  });

  it("slotWeight is capped at 1.0 when unfilledSlots >= 3", () => {
    const result3 = computePositionPriority(0.5, 3, 1, 1);
    const result10 = computePositionPriority(0.5, 10, 1, 1);
    // Both should have the same slot weight component
    expect(result3).toBeCloseTo(result10, 5);
  });

  it("budgetFit is 0 when totalTargets is 0 (no division by zero)", () => {
    const result = computePositionPriority(0.5, 2, 0, 0);
    // budgetFit = 0 (guard), slotWeight = min(1, 2/3) = 0.667
    const expected = 0.5 * 0.4 + (2 / 3) * 0.35 + 0 * 0.25;
    expect(result).toBeCloseTo(expected, 5);
  });
});

// ============================================================
// Test 11: totalTargets is sum of all targets across groups
// ============================================================

describe("computeShoppingList — totalTargets aggregation", () => {
  it("totalTargets equals sum of targets across all position groups", () => {
    const players: PoolPlayer[] = [
      makeHitter("SS1", {}, 18, ["SS"]),
      makeHitter("SS2", {}, 12, ["SS"]),
      makeHitter("OF1", {}, 25, ["OF"]),
      makeHitter("OF2", {}, 20, ["OF"]),
      makeHitter("OF3", {}, 15, ["OF"]),
    ];
    const sgpValues = [3.0, 2.0, 5.0, 4.0, 3.5];

    const result = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { SS: 1, OF: 2 },
      remainingSlots: { SS: 1, OF: 2 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
      topN: 3,
    });

    const expectedTotal = result.positionGroups.reduce(
      (sum, g) => sum + g.targets.length,
      0,
    );
    expect(result.totalTargets).toBe(expectedTotal);
  });
});

// ============================================================
// Test 12: computeTimeMs is reported
// ============================================================

describe("computeShoppingList — computeTimeMs", () => {
  it("returns computeTimeMs >= 0", () => {
    const result = computeShoppingList({
      allPlayers: [makeHitter("P1", {}, 20, ["SS"])],
      sgpValues: [3.0],
      needByPosition: { SS: 1 },
      remainingSlots: { SS: 1 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
// Test 13: Dynamic update — filled positions drop off (TARG-04)
// ============================================================

describe("computeShoppingList — dynamic roster fill (TARG-04)", () => {
  it("shopping list updates when roster fills a position", () => {
    const players: PoolPlayer[] = [
      makeHitter("SS1", { HR: 15 }, 18, ["SS"]),
      makeHitter("OF1", { HR: 25 }, 30, ["OF"]),
      makeHitter("OF2", { HR: 20 }, 22, ["OF"]),
      makeHitter("OF3", { HR: 18 }, 18, ["OF"]),
      makeHitter("1B1", { HR: 28 }, 35, ["1B"]),
    ];
    const sgpValues = [3.0, 5.0, 4.0, 3.5, 6.0];

    // Step 1: SS, OF, 1B all needed — all three groups should appear
    const step1 = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { SS: 1, OF: 3, "1B": 1 },
      remainingSlots: { SS: 1, OF: 3, "1B": 1 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    const positionsStep1 = step1.positionGroups.map(g => g.position);
    expect(positionsStep1).toContain("SS");
    expect(positionsStep1).toContain("OF");
    expect(positionsStep1).toContain("1B");

    // Step 2: Simulate SS slot filled — remove SS from needByPosition
    const step2 = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition: { OF: 3, "1B": 1 },  // SS filled — not in needByPosition
      remainingSlots: { OF: 3, "1B": 1 },
      scarcitySignals: [],
      opponentModel: makeOpponentModel(),
      myBudget: 100,
      weakCategories: new Set(),
    });

    const positionsStep2 = step2.positionGroups.map(g => g.position);
    // SS dropped off
    expect(positionsStep2).not.toContain("SS");
    // OF and 1B still present
    expect(positionsStep2).toContain("OF");
    expect(positionsStep2).toContain("1B");
  });
});

// ============================================================
// Test 14: Dynamic update — priority re-sorts when scarcity changes (PRIO-03)
// ============================================================

describe("computeShoppingList — priority re-sorts on scarcity change (PRIO-03)", () => {
  it("OF ranks above SS when OF scarcity is higher, SS ranks above OF when SS scarcity is higher", () => {
    const players: PoolPlayer[] = [
      makeHitter("SS1", { HR: 15 }, 18, ["SS"]),
      makeHitter("SS2", { HR: 10 }, 12, ["SS"]),
      makeHitter("SS3", { HR: 8 }, 10, ["SS"]),
      makeHitter("OF1", { HR: 25 }, 30, ["OF"]),
      makeHitter("OF2", { HR: 20 }, 22, ["OF"]),
      makeHitter("OF3", { HR: 15 }, 18, ["OF"]),
    ];
    const sgpValues = [3.0, 2.0, 1.5, 5.0, 4.0, 3.5];
    const needByPosition = { SS: 1, OF: 1 };
    const remainingSlots = { SS: 1, OF: 1 };
    const opponentModel = makeOpponentModel(200);  // large budget — budgetFit ~ 1 for both
    const myBudget = 200;

    // State A: SS scarcity=0.2, OF scarcity=0.8 → OF should have higher priority
    const stateA = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition,
      remainingSlots,
      scarcitySignals: [
        makeScarcitySignal("SS", 0.2),
        makeScarcitySignal("OF", 0.8),
      ],
      opponentModel,
      myBudget,
      weakCategories: new Set(),
    });

    const ssA = stateA.positionGroups.find(g => g.position === "SS")!;
    const ofA = stateA.positionGroups.find(g => g.position === "OF")!;
    expect(ssA).toBeDefined();
    expect(ofA).toBeDefined();
    // OF has higher scarcity → higher priority
    expect(ofA.priorityScore).toBeGreaterThan(ssA.priorityScore);
    // OF group comes first
    expect(stateA.positionGroups[0].position).toBe("OF");

    // State B: SS scarcity=0.9, OF scarcity=0.3 → SS should now have higher priority
    const stateB = computeShoppingList({
      allPlayers: players,
      sgpValues,
      needByPosition,
      remainingSlots,
      scarcitySignals: [
        makeScarcitySignal("SS", 0.9),
        makeScarcitySignal("OF", 0.3),
      ],
      opponentModel,
      myBudget,
      weakCategories: new Set(),
    });

    const ssB = stateB.positionGroups.find(g => g.position === "SS")!;
    const ofB = stateB.positionGroups.find(g => g.position === "OF")!;
    expect(ssB).toBeDefined();
    expect(ofB).toBeDefined();
    // SS now has higher scarcity → higher priority
    expect(ssB.priorityScore).toBeGreaterThan(ofB.priorityScore);
    // SS group comes first
    expect(stateB.positionGroups[0].position).toBe("SS");
  });
});
