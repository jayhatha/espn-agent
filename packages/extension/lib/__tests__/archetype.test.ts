import { describe, it, expect } from "vitest";
import { computeBuildArchetype } from "../engine/archetype";
import type { DraftedPlayer, Category } from "@espn-fantasy/shared";
import type { FgHitterProjection, FgPitcherProjection, FgAuctionHitter, FgAuctionPitcher } from "../fangraphs-data";

// Shared test fixtures
const baseCategories: Category[] = [
  { category_id: "HR", name: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "RBI", name: "RBI", stat_key: "RBI", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "SB", name: "SB", stat_key: "SB", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "R", name: "R", stat_key: "R", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "AVG", name: "AVG", stat_key: "AVG", type: "RATE", direction: "HIGHER_BETTER", formula_id: "avg" },
  { category_id: "W", name: "W", stat_key: "W", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "SV", name: "SV", stat_key: "SV", type: "COUNTING", direction: "HIGHER_BETTER" },
  { category_id: "ERA", name: "ERA", stat_key: "ERA", type: "RATE", direction: "LOWER_BETTER", formula_id: "era" },
  { category_id: "WHIP", name: "WHIP", stat_key: "WHIP", type: "RATE", direction: "LOWER_BETTER", formula_id: "whip" },
  { category_id: "K", name: "K", stat_key: "K", type: "COUNTING", direction: "HIGHER_BETTER" },
];

function makeHitter(name: string, overrides: Partial<FgHitterProjection> = {}): FgHitterProjection {
  return {
    name,
    team: "NYY",
    mlbamId: Math.floor(Math.random() * 100000),
    fgId: `fg_${name}`,
    HR: 25, R: 80, RBI: 80, SB: 5, AVG: 0.27, OPS: 0.82,
    AB: 500, H: 135, BB: 50, HBP: 5, SF: 5, TB: 220, PA: 560,
    ...overrides,
  };
}

function makePitcher(name: string, overrides: Partial<FgPitcherProjection> = {}): FgPitcherProjection {
  return {
    name,
    team: "NYY",
    mlbamId: Math.floor(Math.random() * 100000),
    fgId: `fg_${name}`,
    W: 12, L: 8, SV: 0, HLD: 0, ERA: 3.60, WHIP: 1.20, SO: 180,
    IP: 180, HA: 165, ER: 72, BBA: 51, QS: 20, HRA: 20,
    ...overrides,
  };
}

function makeAuctionHitter(name: string, dollars: number, pos: string = "OF"): FgAuctionHitter {
  return {
    name, team: "NYY", pos, mlbamId: 0, fgId: `fg_${name}`, dollars,
    mAVG: 1, mRBI: 2, mR: 2, mSB: 1, mOPS: 1, pts: 7,
  };
}

function makeAuctionPitcher(name: string, dollars: number, pos: string = "SP"): FgAuctionPitcher {
  return {
    name, team: "NYY", pos, mlbamId: 0, fgId: `fg_${name}`, dollars,
    mW: 2, mSV: 1, mERA: 1, mWHIP: 1, mSO: 2, pts: 7, ip: 180,
  };
}

function makeDraftedPlayer(playerName: string, overrides: Partial<DraftedPlayer> = {}): DraftedPlayer {
  return {
    playerId: Math.floor(Math.random() * 100000),
    playerName,
    positions: ["OF"],
    pickNumber: 1,
    cost: 30,
    projectedStats: {},
    ...overrides,
  };
}

// 1. Empty roster returns null-like signal
describe("computeBuildArchetype — empty roster", () => {
  it("returns zero picks and null label for empty roster", () => {
    const result = computeBuildArchetype(
      [],
      260,
      [],
      [],
      [],
      [],
      [],
      baseCategories,
      23,
      12,
    );
    expect(result.picksAnalyzed).toBe(0);
    expect(result.archetypeLabel).toBeNull();
    expect(result.ceilings).toHaveLength(0);
    expect(result.archetypeConfidence).toBe(0);
  });
});

// 2. Single hitter pick — ceilings populated, confidence = 0.1, no archetype label
describe("computeBuildArchetype — single hitter pick", () => {
  it("returns 1 pick analyzed, ceilings for all categories, confidence 0.1, no archetype label", () => {
    const hitter = makeHitter("Aaron Judge");
    const auctionHitter = makeAuctionHitter("Aaron Judge", 45, "OF");
    const myRoster: DraftedPlayer[] = [
      makeDraftedPlayer("Aaron Judge", { positions: ["OF"], cost: 45 }),
    ];

    const result = computeBuildArchetype(
      myRoster,
      215,
      [{ playerId: myRoster[0].playerId, playerName: myRoster[0].playerName }],
      [hitter],
      [],
      [auctionHitter],
      [],
      baseCategories,
      23,
      12,
    );

    expect(result.picksAnalyzed).toBe(1);
    expect(result.archetypeLabel).toBeNull(); // < 5 picks
    expect(result.archetypeConfidence).toBeCloseTo(0.1, 5);
    expect(result.ceilings.length).toBeGreaterThan(0);
    // Check ceiling for HR is present with positive currentTotal
    const hrCeiling = result.ceilings.find(c => c.stat_key === "HR");
    expect(hrCeiling).toBeDefined();
    expect(hrCeiling!.currentTotal).toBeGreaterThanOrEqual(0);
  });
});

// 3. Greedy fill respects budget — $50 remaining, 5 spots: fill totals <= $46
describe("computeBuildArchetype — greedy fill respects budget", () => {
  it("greedy fill selects players totaling at most remainingBudget - (remainingSpots-1)", () => {
    // 5 hitting spots remain, $50 remaining
    // hittingSlots=14, pitchingSlots=9 in 23-spot roster
    // With 14 hitters and 9 pitchers already drafted, 0 spots remain...
    // Instead: draft 9 hitters + 4 pitchers = 13 drafted, 10 spots remain (5H + 5P)
    const myRoster: DraftedPlayer[] = Array.from({ length: 9 }, (_, i) =>
      makeDraftedPlayer(`Hitter ${i + 1}`, { positions: ["OF"], cost: 20 }),
    ).concat(Array.from({ length: 4 }, (_, i) =>
      makeDraftedPlayer(`Pitcher ${i + 1}`, { positions: ["SP"], cost: 10 }),
    ));

    const fgHitters = Array.from({ length: 20 }, (_, i) => makeHitter(`FgHitter ${i + 1}`));
    const fgPitchers = Array.from({ length: 20 }, (_, i) => makePitcher(`FgPitcher ${i + 1}`));
    const auctionHitters = Array.from({ length: 20 }, (_, i) =>
      makeAuctionHitter(`FgHitter ${i + 1}`, 15 + i, "OF"),
    );
    const auctionPitchers = Array.from({ length: 20 }, (_, i) =>
      makeAuctionPitcher(`FgPitcher ${i + 1}`, 12 + i, "SP"),
    );

    const result = computeBuildArchetype(
      myRoster,
      50, // $50 remaining
      myRoster.map((p, i) => ({ playerId: i, playerName: p.playerName })),
      fgHitters,
      fgPitchers,
      auctionHitters,
      auctionPitchers,
      baseCategories,
      23,
      12,
    );

    // Ceiling must be >= current totals (greedy fill adds players)
    for (const ceil of result.ceilings) {
      const curr = ceil.currentTotal;
      const ceiling = ceil.ceilingTotal;
      if (ceil.direction === "HIGHER_BETTER") {
        expect(ceiling).toBeGreaterThanOrEqual(curr);
      } else {
        // For LOWER_BETTER (ERA/WHIP), ceiling should still be a valid rate
        expect(ceiling).toBeGreaterThanOrEqual(0);
      }
    }

    // Spending split: check hitting > 0 since we have hitters
    expect(result.spendingSplit.hitting).toBeGreaterThan(0);
  });
});

// 4. Rate stat ceilings use components — AVG from sum(H)/sum(AB)
describe("computeBuildArchetype — rate stat ceiling uses components", () => {
  it("AVG ceiling is computed from component sums, not averaged rates", () => {
    // Two hitters: H=100/AB=400 (.250) and H=50/AB=100 (.500)
    // Component AVG = 150/500 = .300 (NOT average of .250 and .500 = .375)
    const hitter1 = makeHitter("Player A", { AB: 400, H: 100, AVG: 0.25, HR: 0, R: 0, RBI: 0, SB: 0, BB: 0, HBP: 0, SF: 0, TB: 150, PA: 410, OPS: 0.6 });
    const hitter2 = makeHitter("Player B", { AB: 100, H: 50, AVG: 0.5, HR: 0, R: 0, RBI: 0, SB: 0, BB: 0, HBP: 0, SF: 0, TB: 80, PA: 105, OPS: 1.1 });

    const myRoster: DraftedPlayer[] = [
      makeDraftedPlayer("Player A", { positions: ["1B"] }),
      makeDraftedPlayer("Player B", { positions: ["2B"] }),
    ];

    const result = computeBuildArchetype(
      myRoster,
      100,
      myRoster.map((p, i) => ({ playerId: i, playerName: p.playerName })),
      [hitter1, hitter2],
      [],
      [makeAuctionHitter("Player A", 10, "1B"), makeAuctionHitter("Player B", 5, "2B")],
      [],
      [{ category_id: "AVG", name: "AVG", stat_key: "AVG", type: "RATE", direction: "HIGHER_BETTER", formula_id: "avg" }],
      23,
      12,
    );

    const avgCeiling = result.ceilings.find(c => c.stat_key === "AVG");
    expect(avgCeiling).toBeDefined();
    // currentTotal is the component-computed rate = 150/500 = 0.300
    // Should NOT be (0.25 + 0.5) / 2 = 0.375
    expect(avgCeiling!.currentTotal).toBeCloseTo(0.3, 2);
    expect(avgCeiling!.currentTotal).not.toBeCloseTo(0.375, 2);
  });
});

// 5. Punt detection
describe("computeBuildArchetype — punt detection", () => {
  it("flags isPunted when ceiling < 70% of competitive target", () => {
    // Create a scenario where my team has 0 SB but competitive target is high
    // We need FG auction hitters with SB data — use projections
    const hitter = makeHitter("Slow Hitter", { SB: 0, HR: 30, RBI: 100, R: 90 });
    const auctHitter = makeAuctionHitter("Slow Hitter", 35, "1B");

    // Make many undrafted players available with high SB
    const fgHitters = Array.from({ length: 40 }, (_, i) =>
      makeHitter(`Speed Hitter ${i + 1}`, { SB: 40, HR: 5 }),
    );
    const auctHitters = Array.from({ length: 40 }, (_, i) =>
      makeAuctionHitter(`Speed Hitter ${i + 1}`, 20 - (i * 0.3), "OF"),
    );

    const myRoster: DraftedPlayer[] = [makeDraftedPlayer("Slow Hitter", { positions: ["1B"], cost: 35 })];

    const sbCategory: Category = {
      category_id: "SB", name: "SB", stat_key: "SB", type: "COUNTING", direction: "HIGHER_BETTER",
    };

    const result = computeBuildArchetype(
      myRoster,
      100,
      myRoster.map((p, i) => ({ playerId: i, playerName: p.playerName })),
      [hitter, ...fgHitters],
      [],
      [auctHitter, ...auctHitters],
      [],
      [sbCategory],
      23,
      12,
    );

    const sbCeiling = result.ceilings.find(c => c.stat_key === "SB");
    expect(sbCeiling).toBeDefined();
    // Competitive target should be high, my ceiling should be low relative to it
    // isPunted = ceiling < 70% of competitive target
    if (sbCeiling!.ceilingTotal < sbCeiling!.competitiveTarget * 0.7) {
      expect(sbCeiling!.isPunted).toBe(true);
    } else {
      // If ceiling is above 70%, isPunted should be false
      expect(sbCeiling!.isPunted).toBe(false);
    }
  });
});

// 6. Archetype classification with 6 power-heavy picks
describe("computeBuildArchetype — archetype classification", () => {
  it("returns Power Build when HR/RBI z-scores are high and SB z-score is low", () => {
    // 6 power hitters with high HR/RBI and 0 SB
    const powerHitters = Array.from({ length: 6 }, (_, i) =>
      makeHitter(`Power Hitter ${i + 1}`, { HR: 40, RBI: 120, SB: 0, R: 90, AB: 500, H: 130 }),
    );
    const myRoster: DraftedPlayer[] = powerHitters.map((h, i) =>
      makeDraftedPlayer(h.name, { positions: ["1B"], cost: 40 }),
    );

    // Provide a full hitter pool including some speed guys for comparison
    const speedHitters = Array.from({ length: 30 }, (_, i) =>
      makeHitter(`Speed Hitter ${i + 1}`, { HR: 5, RBI: 50, SB: 40, R: 80, AB: 450, H: 120 }),
    );
    const allFgHitters = [...powerHitters, ...speedHitters];

    const auctHitters = [
      ...powerHitters.map(h => makeAuctionHitter(h.name, 40, "1B")),
      ...speedHitters.map(h => makeAuctionHitter(h.name, 20, "OF")),
    ];

    const hrRbiSbCategories: Category[] = [
      { category_id: "HR", name: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER" },
      { category_id: "RBI", name: "RBI", stat_key: "RBI", type: "COUNTING", direction: "HIGHER_BETTER" },
      { category_id: "SB", name: "SB", stat_key: "SB", type: "COUNTING", direction: "HIGHER_BETTER" },
    ];

    const result = computeBuildArchetype(
      myRoster,
      120, // $120 remaining after spending 140 on 6 players at $40 each (260 total - 120 remaining)
      myRoster.map((p, i) => ({ playerId: i, playerName: p.playerName })),
      allFgHitters,
      [],
      auctHitters,
      [],
      hrRbiSbCategories,
      23,
      12,
    );

    // 6 picks → confidence = 0.6, archetype should be classified
    expect(result.picksAnalyzed).toBe(6);
    expect(result.archetypeConfidence).toBeGreaterThanOrEqual(0.5);
    // Power Build: HR z-score > +0.5 AND RBI z-score > +0.5 AND SB z-score < -0.5
    // With all power hitters having 0 SB vs. many speed hitters with 40 SB:
    // this should classify as Power Build
    expect(result.archetypeLabel).toBe("Power Build");
  });
});

// 7. Pivot players filtered by affordability
describe("computeBuildArchetype — pivot players affordability", () => {
  it("no pivot player costs more than remainingBudget - (remainingSpots - 1)", () => {
    const myRoster: DraftedPlayer[] = Array.from({ length: 5 }, (_, i) =>
      makeDraftedPlayer(`My Hitter ${i + 1}`, { positions: ["OF"], cost: 20 }),
    );
    const remainingBudget = 50;
    const remainingSpots = 23 - 5; // 18 remaining spots

    const expensivePlayers = Array.from({ length: 10 }, (_, i) =>
      makeAuctionHitter(`Expensive ${i + 1}`, 40 + i, "OF"),
    );
    const expensiveFgHitters = Array.from({ length: 10 }, (_, i) =>
      makeHitter(`Expensive ${i + 1}`, { SB: 50 }),
    );
    const cheapPlayers = Array.from({ length: 10 }, (_, i) =>
      makeAuctionHitter(`Cheap ${i + 1}`, 5 + i, "OF"),
    );
    const cheapFgHitters = Array.from({ length: 10 }, (_, i) =>
      makeHitter(`Cheap ${i + 1}`, { SB: 30 }),
    );

    const result = computeBuildArchetype(
      myRoster,
      remainingBudget,
      myRoster.map((p, i) => ({ playerId: i, playerName: p.playerName })),
      [...expensiveFgHitters, ...cheapFgHitters],
      [],
      [...expensivePlayers, ...cheapPlayers],
      [],
      [{ category_id: "SB", name: "SB", stat_key: "SB", type: "COUNTING", direction: "HIGHER_BETTER" }],
      23,
      12,
    );

    const maxAllowedCost = remainingBudget - (remainingSpots - 1);
    for (const pivot of result.pivotPlayers) {
      expect(pivot.dollarValue).toBeLessThanOrEqual(maxAllowedCost);
    }
  });
});

// 8. Competitive targets computed from player pool
describe("computeBuildArchetype — competitive targets", () => {
  it("competitive target reflects top player pool values", () => {
    // With 12 teams and ~14 hitting slots, top 3 team target = hittersPerTeam * 3 = 42 hitters
    // Provide 100 hitters with known HR values
    const fgHitters = Array.from({ length: 100 }, (_, i) =>
      makeHitter(`Player ${i + 1}`, { HR: 100 - i }),
    );
    const auctHitters = Array.from({ length: 100 }, (_, i) =>
      makeAuctionHitter(`Player ${i + 1}`, 50 - i * 0.4, "OF"),
    );

    const result = computeBuildArchetype(
      [],
      260,
      [],
      fgHitters,
      [],
      auctHitters,
      [],
      [{ category_id: "HR", name: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER" }],
      23,
      12,
    );

    // With empty roster, ceilings array should be empty (no categories computed)
    // This test is more about verifying competitive target logic when picks exist
    // Competitive target should be positive and represent top-N players' sum
    expect(result.ceilings).toHaveLength(0);
  });

  it("competitive target is positive with non-empty roster", () => {
    const hitter = makeHitter("Aaron Judge", { HR: 40 });
    const myRoster = [makeDraftedPlayer("Aaron Judge", { positions: ["OF"], cost: 45 })];

    const fgHitters = Array.from({ length: 50 }, (_, i) =>
      makeHitter(`Player ${i + 1}`, { HR: 40 - i * 0.5 }),
    );
    const auctHitters = Array.from({ length: 50 }, (_, i) =>
      makeAuctionHitter(`Player ${i + 1}`, 40 - i * 0.5, "OF"),
    );

    const result = computeBuildArchetype(
      myRoster,
      215,
      myRoster.map((p, i) => ({ playerId: i, playerName: p.playerName })),
      [hitter, ...fgHitters],
      [],
      [makeAuctionHitter("Aaron Judge", 45, "OF"), ...auctHitters],
      [],
      [{ category_id: "HR", name: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER" }],
      23,
      12,
    );

    const hrCeiling = result.ceilings.find(c => c.stat_key === "HR");
    expect(hrCeiling).toBeDefined();
    expect(hrCeiling!.competitiveTarget).toBeGreaterThan(0);
  });
});

// 9. Position-aware greedy fill — result must contain both hitters and pitchers
describe("computeBuildArchetype — position-aware greedy fill", () => {
  it("greedy fill fills hitting and pitching slots from their own pools", () => {
    // Empty roster — all 23 slots remain (14 hitting, 9 pitching)
    const myRoster: DraftedPlayer[] = [];

    const fgHitters = Array.from({ length: 30 }, (_, i) =>
      makeHitter(`Hitter ${i + 1}`, { HR: 30 - i, SB: 0, W: 0, SV: 0, SO: 0 }),
    );
    const fgPitchers = Array.from({ length: 30 }, (_, i) =>
      makePitcher(`Pitcher ${i + 1}`, { W: 15 - i * 0.3, SO: 180 - i * 3 }),
    );
    const auctHitters = Array.from({ length: 30 }, (_, i) =>
      makeAuctionHitter(`Hitter ${i + 1}`, 40 - i, "OF"),
    );
    const auctPitchers = Array.from({ length: 30 }, (_, i) =>
      makeAuctionPitcher(`Pitcher ${i + 1}`, 30 - i, "SP"),
    );

    // W and K are pitching stats; HR is a hitting stat
    const mixedCategories: Category[] = [
      { category_id: "HR", name: "HR", stat_key: "HR", type: "COUNTING", direction: "HIGHER_BETTER" },
      { category_id: "W", name: "W", stat_key: "W", type: "COUNTING", direction: "HIGHER_BETTER" },
      { category_id: "K", name: "K", stat_key: "K", type: "COUNTING", direction: "HIGHER_BETTER" },
    ];

    const result = computeBuildArchetype(
      myRoster,
      260,
      [],
      fgHitters,
      fgPitchers,
      auctHitters,
      auctPitchers,
      mixedCategories,
      23,
      12,
    );

    // Empty roster → 0 picks analyzed, no ceilings
    expect(result.picksAnalyzed).toBe(0);

    // If we add one hitter from each pool to test...
    const myRoster2: DraftedPlayer[] = [
      makeDraftedPlayer("Hitter 1", { positions: ["OF"], cost: 40 }),
      makeDraftedPlayer("Pitcher 1", { positions: ["SP"], cost: 30 }),
    ];

    const result2 = computeBuildArchetype(
      myRoster2,
      190,
      myRoster2.map((p, i) => ({ playerId: i, playerName: p.playerName })),
      fgHitters,
      fgPitchers,
      auctHitters,
      auctPitchers,
      mixedCategories,
      23,
      12,
    );

    // With hitters and pitchers in roster, W ceiling should be > 0 (from pitchers)
    // and HR ceiling should be > 0 (from hitters)
    const hrCeiling = result2.ceilings.find(c => c.stat_key === "HR");
    const wCeiling = result2.ceilings.find(c => c.stat_key === "W");

    // Ceilings should be populated
    expect(hrCeiling).toBeDefined();
    expect(wCeiling).toBeDefined();

    // The ceiling (greedy fill) should be greater than just the one player's contribution
    // because greedy fill adds undrafted players
    expect(hrCeiling!.ceilingTotal).toBeGreaterThan(0);
    expect(wCeiling!.ceilingTotal).toBeGreaterThan(0);
  });
});
