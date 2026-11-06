import { describe, it, expect } from "vitest";
import { allocateProjections } from "../allocator.js";
import type { AllocationInput, RosteredPlayer } from "../types.js";

function makePlayer(
  playerId: number,
  positions: string[],
  rosterStatus: "active" | "bench" | "il",
  rosterSlot: string | null = null,
): RosteredPlayer {
  return {
    playerId,
    positions,
    rosterStatus,
    rosterSlot,
    projectedComponents: null, // projections come from projectionsByPlayerId
  };
}

const DEFAULT_INPUT: AllocationInput = {
  roster: [],
  rosterSlots: { C: 1, SS: 1, "1B": 1, OF: 2, SP: 2, RP: 1, BN: 3 },
  projectionsByPlayerId: new Map(),
  gsUsed: 0,
  gsCap: 200,
  projectionAsOfDate: "2026-04-01",
  snapshotDate: "2026-04-01",
  seasonEndDate: "2026-09-28",
};

describe("allocateProjections", () => {
  it("returns zero components for empty roster", () => {
    const result = allocateProjections(DEFAULT_INPUT);
    expect(result.batterComponents).toEqual({});
    expect(result.pitcherComponents).toEqual({});
    expect(result.assignments).toEqual([]);
    expect(result.gaps).toEqual([]);
  });

  it("basic allocation: starters' batting stats go to batterComponents, pitching stats to pitcherComponents", () => {
    // 5 hitters + 2 pitchers roster
    const catcher = makePlayer(1, ["C"], "active");
    const shortstop = makePlayer(2, ["SS"], "active");
    const firstBaseman = makePlayer(3, ["1B"], "active");
    const of1 = makePlayer(4, ["OF"], "active");
    const of2 = makePlayer(5, ["OF"], "active");
    const sp1 = makePlayer(6, ["SP"], "active");
    const rp1 = makePlayer(7, ["RP"], "active");

    const projections = new Map([
      [
        1,
        {
          AB: 300,
          H: 80,
          HR: 15,
          RBI: 60,
          R: 50,
          SB: 3,
          BB: 30,
          HBP: 5,
          SF: 4,
          TB: 130,
        },
      ],
      [
        2,
        {
          AB: 350,
          H: 95,
          HR: 12,
          RBI: 55,
          R: 70,
          SB: 25,
          BB: 40,
          HBP: 3,
          SF: 3,
          TB: 140,
        },
      ],
      [
        3,
        {
          AB: 400,
          H: 110,
          HR: 35,
          RBI: 110,
          R: 90,
          SB: 2,
          BB: 50,
          HBP: 6,
          SF: 5,
          TB: 220,
        },
      ],
      [
        4,
        {
          AB: 380,
          H: 100,
          HR: 20,
          RBI: 80,
          R: 85,
          SB: 15,
          BB: 45,
          HBP: 4,
          SF: 3,
          TB: 170,
        },
      ],
      [
        5,
        {
          AB: 360,
          H: 95,
          HR: 18,
          RBI: 75,
          R: 80,
          SB: 20,
          BB: 40,
          HBP: 5,
          SF: 4,
          TB: 160,
        },
      ],
      [6, { IP: 180, ER: 60, HA: 150, BBA: 50, K: 200, W: 14, SV: 0, GS: 30 }],
      [7, { IP: 65, ER: 25, HA: 55, BBA: 22, K: 70, W: 5, SV: 30, GS: 0 }],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      roster: [catcher, shortstop, firstBaseman, of1, of2, sp1, rp1],
      projectionsByPlayerId: projections,
    };

    const result = allocateProjections(input);

    // Batter components should have HR from all 5 hitters
    expect(result.batterComponents.HR).toBeGreaterThan(0);
    // Pitcher components should have K from pitchers
    expect(result.pitcherComponents.K).toBeGreaterThan(0);
    // Batter components should NOT contain IP (pitching stat)
    expect(result.batterComponents.IP ?? 0).toBe(0);
    // Pitcher components should NOT contain HR (batting stat)
    expect(result.pitcherComponents.HR ?? 0).toBe(0);
  });

  it("allocated HR <= naive sum of all players' HR (bench excluded)", () => {
    // Active starters + bench players — bench should not contribute
    const starter = makePlayer(1, ["1B"], "active");
    const benchPlayer = makePlayer(2, ["OF"], "bench");

    const projections = new Map([
      [
        1,
        {
          AB: 400,
          H: 110,
          HR: 35,
          RBI: 110,
          R: 90,
          SB: 2,
          BB: 50,
          HBP: 6,
          SF: 5,
          TB: 220,
        },
      ],
      [
        2,
        {
          AB: 380,
          H: 100,
          HR: 30,
          RBI: 80,
          R: 85,
          SB: 15,
          BB: 45,
          HBP: 4,
          SF: 3,
          TB: 170,
        },
      ],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { "1B": 1, BN: 3 },
      roster: [starter, benchPlayer],
      projectionsByPlayerId: projections,
    };

    const result = allocateProjections(input);

    // Naive sum: 35 + 30 = 65
    const naiveSum = 35 + 30;
    expect(result.batterComponents.HR ?? 0).toBeLessThanOrEqual(naiveSum);
    // Allocated should only include the starter's HR (35), not bench player's
    expect(result.batterComponents.HR).toBeCloseTo(35, 1);
  });

  it("two-way player (Ohtani): AB/HR go to batterComponents, IP/K go to pitcherComponents", () => {
    // Ohtani: plays both 1B/OF slot AND SP slot in same game
    // For allocation: he occupies a hitter slot, but contributes pitching too
    const ohtani = makePlayer(100, ["1B", "SP"], "active");

    const projections = new Map([
      [
        100,
        {
          AB: 300,
          H: 85,
          HR: 30,
          RBI: 90,
          R: 80,
          SB: 5,
          BB: 35,
          HBP: 3,
          SF: 4,
          TB: 175,
          IP: 100,
          ER: 35,
          HA: 80,
          BBA: 30,
          K: 150,
          W: 8,
          SV: 0,
          GS: 18,
        },
      ],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { "1B": 1, SP: 1, BN: 3 },
      roster: [ohtani],
      projectionsByPlayerId: projections,
    };

    const result = allocateProjections(input);

    // Batting stats in batterComponents
    expect(result.batterComponents.AB).toBeGreaterThan(0);
    expect(result.batterComponents.HR).toBeGreaterThan(0);
    // Pitching stats in pitcherComponents
    expect(result.pitcherComponents.IP).toBeGreaterThan(0);
    expect(result.pitcherComponents.K).toBeGreaterThan(0);
  });

  it("staleness applied: asOfDate=April 1, snapshotDate=July 1 -> projections reduced ~0.5x", () => {
    const hitter = makePlayer(1, ["1B"], "active");

    const projections = new Map([
      [
        1,
        {
          AB: 400,
          H: 110,
          HR: 35,
          RBI: 110,
          R: 90,
          SB: 2,
          BB: 50,
          HBP: 6,
          SF: 5,
          TB: 220,
        },
      ],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { "1B": 1, BN: 3 },
      roster: [hitter],
      projectionsByPlayerId: projections,
      projectionAsOfDate: "2026-04-01",
      snapshotDate: "2026-07-01",
    };

    const result = allocateProjections(input);

    // prorateFactor should be ~0.5 (July 1 out of April 1 to Sep 28 season)
    expect(result.prorateFactor).toBeGreaterThan(0.3);
    expect(result.prorateFactor).toBeLessThan(0.7);
    // HR should be reduced proportionally
    expect(result.batterComponents.HR).toBeLessThan(35);
    expect(result.batterComponents.HR).toBeGreaterThan(10);
  });

  it("GS cap scaling: gsUsed=180, gsCap=200, 4 SPs project 20 GS each -> scaled by 20/80=0.25", () => {
    // gsRemaining = 200 - 180 = 20
    // Total projected GS = 4 * 20 = 80
    // scaleFactor = 20 / 80 = 0.25
    const sp1 = makePlayer(1, ["SP"], "active");
    const sp2 = makePlayer(2, ["SP"], "active");
    const sp3 = makePlayer(3, ["SP"], "active");
    const sp4 = makePlayer(4, ["SP"], "active");

    const projections = new Map([
      [1, { IP: 120, ER: 40, HA: 100, BBA: 40, K: 130, W: 10, SV: 0, GS: 20 }],
      [2, { IP: 120, ER: 40, HA: 100, BBA: 40, K: 130, W: 10, SV: 0, GS: 20 }],
      [3, { IP: 120, ER: 40, HA: 100, BBA: 40, K: 130, W: 10, SV: 0, GS: 20 }],
      [4, { IP: 120, ER: 40, HA: 100, BBA: 40, K: 130, W: 10, SV: 0, GS: 20 }],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { SP: 4, BN: 2 },
      roster: [sp1, sp2, sp3, sp4],
      projectionsByPlayerId: projections,
      gsUsed: 180,
      gsCap: 200,
    };

    const result = allocateProjections(input);

    // scaleFactor = 20/80 = 0.25
    expect(result.gsScaleFactor).toBeCloseTo(0.25, 2);
    // K should be scaled: 4 * 130 * 0.25 = 130
    expect(result.pitcherComponents.K).toBeCloseTo(130, 1);
  });

  it("roster gap: no SS-eligible player -> gaps includes {slot:'SS', severity:'empty'}", () => {
    // Roster with no SS
    const catcher = makePlayer(1, ["C"], "active");
    const firstBaseman = makePlayer(2, ["1B"], "active");

    const projections = new Map([
      [
        1,
        {
          AB: 300,
          H: 80,
          HR: 15,
          RBI: 60,
          R: 50,
          SB: 3,
          BB: 30,
          HBP: 5,
          SF: 4,
          TB: 130,
        },
      ],
      [
        2,
        {
          AB: 400,
          H: 110,
          HR: 35,
          RBI: 110,
          R: 90,
          SB: 2,
          BB: 50,
          HBP: 6,
          SF: 5,
          TB: 220,
        },
      ],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { C: 1, SS: 1, "1B": 1, BN: 3 },
      roster: [catcher, firstBaseman],
      projectionsByPlayerId: projections,
    };

    const result = allocateProjections(input);

    const ssGap = result.gaps.find((g) => g.slot === "SS");
    expect(ssGap).toBeDefined();
    expect(ssGap?.severity).toBe("empty");
  });

  it("no roster gap when SS is on bench but can fill SS slot (placed in starting slot by allocator)", () => {
    // When SS is the only SS-eligible player and rosterStatus=active, they fill the SS slot
    // In the scenario where SS player is active, the allocator puts them in SS slot
    const ssPlayer = makePlayer(1, ["SS"], "active");
    const projections = new Map([
      [
        1,
        {
          AB: 350,
          H: 95,
          HR: 12,
          RBI: 55,
          R: 70,
          SB: 25,
          BB: 40,
          HBP: 3,
          SF: 3,
          TB: 140,
        },
      ],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { SS: 1, BN: 3 },
      roster: [ssPlayer],
      projectionsByPlayerId: projections,
    };

    const result = allocateProjections(input);
    const ssGap = result.gaps.find((g) => g.slot === "SS");
    expect(ssGap).toBeUndefined();
  });

  it("prorate factor stored in result.prorateFactor", () => {
    const hitter = makePlayer(1, ["1B"], "active");
    const projections = new Map([
      [
        1,
        {
          AB: 400,
          H: 110,
          HR: 35,
          RBI: 110,
          R: 90,
          SB: 2,
          BB: 50,
          HBP: 6,
          SF: 5,
          TB: 220,
        },
      ],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { "1B": 1, BN: 3 },
      roster: [hitter],
      projectionsByPlayerId: projections,
      projectionAsOfDate: "2026-04-01",
      snapshotDate: "2026-04-01",
    };

    const result = allocateProjections(input);
    expect(result.prorateFactor).toBeCloseTo(1.0, 2);
  });

  it("GS scale factor stored in result.gsScaleFactor (1.0 when under cap)", () => {
    const sp1 = makePlayer(1, ["SP"], "active");
    const projections = new Map([
      [1, { IP: 180, ER: 60, HA: 150, BBA: 50, K: 200, W: 14, SV: 0, GS: 30 }],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { SP: 1, BN: 3 },
      roster: [sp1],
      projectionsByPlayerId: projections,
      gsUsed: 0,
      gsCap: 200,
    };

    const result = allocateProjections(input);
    // 30 GS projected < 200 remaining => no scaling needed
    expect(result.gsScaleFactor).toBe(1.0);
  });

  it("pitcher in P slot contributes to pitcherComponents (not dropped)", () => {
    // Bug fix: pitchers in generic "P" slot were previously skipped entirely
    const sp1 = makePlayer(1, ["SP"], "active");
    const rpInPSlot = makePlayer(2, ["RP"], "active");

    const projections = new Map([
      [1, { IP: 180, ER: 60, HA: 150, BBA: 50, K: 200, W: 14, SV: 0, GS: 30 }],
      [2, { IP: 65, ER: 25, HA: 55, BBA: 22, K: 70, W: 5, SV: 30, GS: 0 }],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { SP: 1, P: 1, BN: 3 },
      roster: [sp1, rpInPSlot],
      projectionsByPlayerId: projections,
    };

    const result = allocateProjections(input);

    // Both pitchers should contribute K to pitcherComponents
    // SP: K=200, RP in P slot: K=70 => total K=270
    expect(result.pitcherComponents.K).toBeCloseTo(270, 1);
    // SP IP + RP IP
    expect(result.pitcherComponents.IP).toBeCloseTo(245, 1);
  });

  it("SP in P slot with projected GS is subject to GS cap scaling", () => {
    // A starter placed in a "P" slot with GS > 0 should be treated as SP for GS cap
    const spInPSlot = makePlayer(1, ["SP"], "active");

    const projections = new Map([
      [1, { IP: 120, ER: 40, HA: 100, BBA: 40, K: 130, W: 10, SV: 0, GS: 20 }],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { P: 1, BN: 3 },
      roster: [spInPSlot],
      projectionsByPlayerId: projections,
      gsUsed: 190,
      gsCap: 200,
    };

    const result = allocateProjections(input);

    // gsRemaining=10, projectedGS=20 => scaleFactor=0.5
    expect(result.gsScaleFactor).toBeCloseTo(0.5, 2);
    expect(result.pitcherComponents.K).toBeCloseTo(65, 1); // 130 * 0.5
  });

  it("higher-projected bench player can replace active hitter in RoS allocation", () => {
    const starter = makePlayer(1, ["OF"], "active");
    const benchPlayer = makePlayer(2, ["OF"], "bench");

    const projections = new Map([
      [
        1,
        {
          AB: 380,
          H: 100,
          HR: 20,
          RBI: 80,
          R: 85,
          SB: 15,
          BB: 45,
          HBP: 4,
          SF: 3,
          TB: 170,
        },
      ],
      [
        2,
        {
          AB: 380,
          H: 100,
          HR: 99,
          RBI: 99,
          R: 99,
          SB: 99,
          BB: 45,
          HBP: 4,
          SF: 3,
          TB: 170,
        },
      ],
    ]);

    const input: AllocationInput = {
      ...DEFAULT_INPUT,
      rosterSlots: { OF: 1, BN: 3 },
      roster: [starter, benchPlayer],
      projectionsByPlayerId: projections,
    };

    const result = allocateProjections(input);

    expect(result.batterComponents.HR).toBeCloseTo(99, 1);
  });
});
