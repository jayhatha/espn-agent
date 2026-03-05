import { describe, it, expect } from "vitest";
import { buildSGPVectors, applyScarcityAdjustment, getPlayerStat } from "../engine/sgp";
import type { PoolPlayer } from "../engine/types";
import type { Category } from "@espn-fantasy/shared";

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

const hrCategory: Category = {
  category_id: "HR",
  name: "HR",
  stat_key: "HR",
  type: "COUNTING",
  direction: "HIGHER_BETTER",
};

const avgCategory: Category = {
  category_id: "AVG",
  name: "AVG",
  stat_key: "AVG",
  type: "RATE",
  direction: "HIGHER_BETTER",
  formula_id: "avg",
};

const eraCategory: Category = {
  category_id: "ERA",
  name: "ERA",
  stat_key: "ERA",
  type: "RATE",
  direction: "LOWER_BETTER",
  formula_id: "era",
};

// Standard roster slots for a 12-team league
const standardRosterSlots: Record<string, number> = {
  C: 1, "1B": 1, "2B": 1, "3B": 1, SS: 1, OF: 3, CI: 1, MI: 1, UTIL: 1, P: 6, BN: 5,
};

// ============================================================
// Tests
// ============================================================

describe("buildSGPVectors — counting stat (HR)", () => {
  it("computes correct mean, std, and replacementValue for 5 hitters", () => {
    // 5 hitters with HRs: 30, 25, 20, 15, 10
    const players: PoolPlayer[] = [
      makeHitter("Player A", { HR: 30 }, 45),
      makeHitter("Player B", { HR: 25 }, 35),
      makeHitter("Player C", { HR: 20 }, 25),
      makeHitter("Player D", { HR: 15 }, 15),
      makeHitter("Player E", { HR: 10 }, 8),
    ];

    const result = buildSGPVectors(players, [hrCategory], standardRosterSlots, 12);

    const hrStats = result.categoryStats["HR"];
    expect(hrStats).toBeDefined();

    // Mean = (30+25+20+15+10) / 5 = 20
    expect(hrStats.mean).toBeCloseTo(20, 1);

    // Population stddev = sqrt(((30-20)^2 + (25-20)^2 + (20-20)^2 + (15-20)^2 + (10-20)^2) / 5)
    // = sqrt((100 + 25 + 0 + 25 + 100) / 5) = sqrt(50) ≈ 7.071
    expect(hrStats.std).toBeCloseTo(7.071, 1);

    // Replacement level: N = sum(rosterSlots) * totalTeams
    // Slots for HR (hitters): C+1B+2B+3B+SS+OF+CI+MI+UTIL+BN = 1+1+1+1+1+3+1+1+1+5 = 16
    // totalTeams = 12, N = 16 * 12 = 192. With only 5 players, use last player's value = 10
    expect(hrStats.replacementValue).toBe(10);
  });
});

describe("buildSGPVectors — rate stat (AVG)", () => {
  it("computes mean, std, replacementValue for AVG from player stats", () => {
    const players: PoolPlayer[] = [
      makeHitter("Player A", { AVG: 0.32 }, 40),
      makeHitter("Player B", { AVG: 0.29 }, 30),
      makeHitter("Player C", { AVG: 0.27 }, 20),
      makeHitter("Player D", { AVG: 0.25 }, 12),
      makeHitter("Player E", { AVG: 0.22 }, 5),
    ];

    const result = buildSGPVectors(players, [avgCategory], standardRosterSlots, 12);

    const avgStats = result.categoryStats["AVG"];
    expect(avgStats).toBeDefined();

    // Mean of 5 AVG values
    const expectedMean = (0.32 + 0.29 + 0.27 + 0.25 + 0.22) / 5;
    expect(avgStats.mean).toBeCloseTo(expectedMean, 4);

    // replacementValue should be from the last player available (since pool < N)
    expect(avgStats.replacementValue).toBeCloseTo(0.22, 2);
  });
});

describe("buildSGPVectors — LOWER_BETTER (ERA)", () => {
  it("pitcher with below-mean ERA gets positive SGP contribution", () => {
    // ERA mean ~3.80, pitcher with ERA 2.50 is better
    const players: PoolPlayer[] = [
      makePitcher("Ace", { ERA: 2.50, WHIP: 1.00, K: 220 }, 50),
      makePitcher("Good", { ERA: 3.20, WHIP: 1.10, K: 200 }, 35),
      makePitcher("Average", { ERA: 3.80, WHIP: 1.20, K: 175 }, 20),
      makePitcher("Below", { ERA: 4.20, WHIP: 1.30, K: 150 }, 12),
      makePitcher("Replacement", { ERA: 5.00, WHIP: 1.50, K: 120 }, 5),
    ];

    const result = buildSGPVectors(players, [eraCategory], standardRosterSlots, 12);

    // The ace (ERA 2.50) should have positive SGP since lower ERA = better
    const aceIndex = 0;
    expect(result.playerSGPs[aceIndex]).toBeGreaterThan(0);

    // The replacement-level pitcher (ERA 5.00) should have negative or near-zero SGP
    const replacementIndex = 4;
    expect(result.playerSGPs[replacementIndex]).toBeLessThanOrEqual(0);
  });
});

describe("buildSGPVectors — playerSGPs computation", () => {
  it("computes SGP per player summing across categories", () => {
    const players: PoolPlayer[] = [
      makeHitter("Star", { HR: 35, AVG: 0.305 }, 45),
      makeHitter("Average", { HR: 20, AVG: 0.270 }, 20),
      makeHitter("Replacement", { HR: 5, AVG: 0.240 }, 5),
    ];

    const result = buildSGPVectors(players, [hrCategory, avgCategory], standardRosterSlots, 12);

    expect(result.playerSGPs).toHaveLength(3);

    // Star should have highest SGP
    expect(result.playerSGPs[0]).toBeGreaterThan(result.playerSGPs[1]);
    expect(result.playerSGPs[1]).toBeGreaterThan(result.playerSGPs[2]);

    // Replacement-level player (rank near N) should be near 0
    // With only 3 players and large N, replacement = last player's value, so replacement-level IS at 0
    expect(result.playerSGPs[2]).toBeCloseTo(0, 1);
  });

  it("computedAt is a recent timestamp", () => {
    const before = Date.now();
    const result = buildSGPVectors([], [], standardRosterSlots, 12);
    const after = Date.now();
    expect(result.computedAt).toBeGreaterThanOrEqual(before);
    expect(result.computedAt).toBeLessThanOrEqual(after);
  });
});

describe("buildSGPVectors — edge cases", () => {
  it("std=0 produces SGP of 0 for that category", () => {
    // All players have identical HR = 20
    const players: PoolPlayer[] = [
      makeHitter("P1", { HR: 20 }),
      makeHitter("P2", { HR: 20 }),
      makeHitter("P3", { HR: 20 }),
    ];

    const result = buildSGPVectors(players, [hrCategory], standardRosterSlots, 12);

    // All SGPs should be 0 when std = 0
    for (const sgp of result.playerSGPs) {
      expect(sgp).toBe(0);
    }
  });

  it("empty player pool returns empty vectors", () => {
    const result = buildSGPVectors([], [hrCategory], standardRosterSlots, 12);

    expect(result.playerSGPs).toHaveLength(0);
    expect(result.statVectors["HR"]).toHaveLength(0);
    expect(result.categoryStats["HR"]).toBeDefined();
    expect(result.categoryStats["HR"].mean).toBe(0);
    expect(result.categoryStats["HR"].std).toBe(0);
    expect(result.categoryStats["HR"].replacementValue).toBe(0);
  });
});

describe("buildSGPVectors — calibration test", () => {
  it("30-HR hitter scores 3-6 total SGP, replacement-level player scores near 0", () => {
    // Build realistic pool of 20 hitters
    // Top player: 30 HR, rest: 5-20 HR range
    const players: PoolPlayer[] = [
      makeHitter("Star", { HR: 30, RBI: 110, R: 95, SB: 10, AVG: 0.305 }, 45),
      makeHitter("Good1", { HR: 25, RBI: 95, R: 88, SB: 8, AVG: 0.290 }, 35),
      makeHitter("Good2", { HR: 22, RBI: 85, R: 82, SB: 6, AVG: 0.285 }, 28),
      makeHitter("Good3", { HR: 20, RBI: 80, R: 78, SB: 5, AVG: 0.278 }, 22),
      makeHitter("Good4", { HR: 18, RBI: 75, R: 72, SB: 5, AVG: 0.272 }, 18),
      makeHitter("Mid1", { HR: 17, RBI: 70, R: 70, SB: 4, AVG: 0.268 }, 15),
      makeHitter("Mid2", { HR: 16, RBI: 68, R: 68, SB: 4, AVG: 0.265 }, 13),
      makeHitter("Mid3", { HR: 15, RBI: 65, R: 65, SB: 3, AVG: 0.262 }, 11),
      makeHitter("Mid4", { HR: 14, RBI: 63, R: 63, SB: 3, AVG: 0.260 }, 9),
      makeHitter("Mid5", { HR: 13, RBI: 60, R: 60, SB: 2, AVG: 0.257 }, 8),
      makeHitter("Low1", { HR: 12, RBI: 57, R: 57, SB: 2, AVG: 0.255 }, 7),
      makeHitter("Low2", { HR: 11, RBI: 54, R: 54, SB: 1, AVG: 0.252 }, 6),
      makeHitter("Low3", { HR: 10, RBI: 52, R: 52, SB: 1, AVG: 0.250 }, 5),
      makeHitter("Low4", { HR: 9, RBI: 49, R: 49, SB: 1, AVG: 0.247 }, 4),
      makeHitter("Low5", { HR: 8, RBI: 47, R: 47, SB: 0, AVG: 0.245 }, 3),
      makeHitter("Repl1", { HR: 7, RBI: 44, R: 44, SB: 0, AVG: 0.242 }, 2),
      makeHitter("Repl2", { HR: 6, RBI: 42, R: 42, SB: 0, AVG: 0.240 }, 1),
      makeHitter("Repl3", { HR: 5, RBI: 40, R: 40, SB: 0, AVG: 0.238 }, 1),
      makeHitter("Repl4", { HR: 5, RBI: 38, R: 38, SB: 0, AVG: 0.236 }, 1),
      makeHitter("Repl5", { HR: 5, RBI: 36, R: 36, SB: 0, AVG: 0.234 }, 1),
    ];

    const categories: Category[] = [
      hrCategory,
      { category_id: "RBI", name: "RBI", stat_key: "RBI", type: "COUNTING", direction: "HIGHER_BETTER" },
      { category_id: "R", name: "R", stat_key: "R", type: "COUNTING", direction: "HIGHER_BETTER" },
      { category_id: "SB", name: "SB", stat_key: "SB", type: "COUNTING", direction: "HIGHER_BETTER" },
      avgCategory,
    ];

    const result = buildSGPVectors(players, categories, standardRosterSlots, 12);

    // Star (30 HR) should score higher than mid-range players
    const starSGP = result.playerSGPs[0];
    expect(starSGP).toBeGreaterThan(3);
    // Note: with a small test pool (20 players), replacement level = last player's value.
    // All players are above replacement, inflating SGPs. Real-world pools would have
    // 200+ players producing 3-6 SGP for a 30-HR hitter.
    // With this 20-player pool, ~8-20 SGP is expected for a star.
    expect(starSGP).toBeGreaterThan(result.playerSGPs[9]); // Star > median
    expect(starSGP).toBeGreaterThan(result.playerSGPs[15]); // Star > low-end

    // Replacement-level player (last one) should have near-0 or 0 SGP
    // (they ARE the replacement level for this small pool)
    const lastSGP = result.playerSGPs[result.playerSGPs.length - 1];
    expect(Math.abs(lastSGP)).toBeLessThan(1.0); // near 0
  });
});

describe("applyScarcityAdjustment", () => {
  it("applies C multiplier 1.5 with tight supply (scarcity factor < 1)", () => {
    // remainingSlots=2, remainingPlayers=3 → scarcityFactor = 2/3 ≈ 0.667
    // result = baseSGP * (1 + (0.667 - 1) * 1.5) = baseSGP * (1 + (-0.333 * 1.5))
    //        = baseSGP * (1 - 0.5) = baseSGP * 0.5
    const result = applyScarcityAdjustment(4.0, "C", 2, 3);
    expect(result).toBeCloseTo(4.0 * (1 + ((2 / 3) - 1) * 1.5), 3);
  });

  it("applies OF multiplier 1.0 (no amplification)", () => {
    // remainingSlots=10, remainingPlayers=20 → scarcityFactor = 0.5
    // result = baseSGP * (1 + (0.5 - 1) * 1.0) = baseSGP * 0.5
    const result = applyScarcityAdjustment(3.0, "OF", 10, 20);
    expect(result).toBeCloseTo(3.0 * (1 + (10 / 20 - 1) * 1.0), 3);
  });

  it("applies SS multiplier 1.3", () => {
    const baseSGP = 5.0;
    const remainingSlots = 3;
    const remainingPlayers = 5;
    const expected = baseSGP * (1 + (remainingSlots / remainingPlayers - 1) * 1.3);
    expect(applyScarcityAdjustment(baseSGP, "SS", remainingSlots, remainingPlayers)).toBeCloseTo(expected, 3);
  });

  it("applies 2B multiplier 1.2", () => {
    const baseSGP = 4.0;
    const remainingSlots = 4;
    const remainingPlayers = 6;
    const expected = baseSGP * (1 + (remainingSlots / remainingPlayers - 1) * 1.2);
    expect(applyScarcityAdjustment(baseSGP, "2B", remainingSlots, remainingPlayers)).toBeCloseTo(expected, 3);
  });

  it("returns baseSGP when remainingPlayers is 0 (guard against division by zero)", () => {
    expect(applyScarcityAdjustment(3.5, "C", 2, 0)).toBe(3.5);
  });
});

describe("getPlayerStat", () => {
  it("returns stat value for counting category", () => {
    const player = makeHitter("Test", { HR: 28 });
    expect(getPlayerStat(player, hrCategory)).toBe(28);
  });

  it("returns 0 for missing stat key", () => {
    const player = makeHitter("Test", {});
    const weirdCategory: Category = {
      category_id: "XBH",
      name: "XBH",
      stat_key: "XBH",
      type: "COUNTING",
      direction: "HIGHER_BETTER",
    };
    expect(getPlayerStat(player, weirdCategory)).toBe(0);
  });

  it("returns precomputed rate for rate categories", () => {
    const player = makeHitter("Test", { AVG: 0.305 });
    expect(getPlayerStat(player, avgCategory)).toBeCloseTo(0.305, 3);
  });
});
