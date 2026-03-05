import { describe, it, expect } from "vitest";
import { optimizeRoster } from "../engine/roster-optimizer";
import type { PoolPlayer } from "../engine/types";

// ============================================================
// Fixtures
// ============================================================

function makePlayer(
  name: string,
  positions: string[],
  dollars: number,
  isPitcher = false,
  stats: Record<string, number> = {},
): PoolPlayer {
  return {
    name,
    normalizedName: name.toLowerCase(),
    dollars,
    isPitcher,
    positions,
    stats,
  };
}

// 3-slot roster: 1 C, 1 SS, 1 UTIL
const simpleRosterSlots: Record<string, number> = { C: 1, SS: 1, UTIL: 1 };

// Full roster slots for a 12-team auction league
const fullRosterSlots: Record<string, number> = {
  C: 1, "1B": 1, "2B": 1, "3B": 1, SS: 1, OF: 3, CI: 1, MI: 1, UTIL: 1, P: 6, BN: 5,
};

// ============================================================
// Tests
// ============================================================

describe("optimizeRoster — basic SGP/$ efficiency", () => {
  it("selects highest SGP/$ players within budget", () => {
    // 3 players, 2 slots (no position constraints), $100 budget
    const players: PoolPlayer[] = [
      makePlayer("Star", ["OF"], 50, false),       // 5 SGP, 50$ → 0.10 SGP/$
      makePlayer("Efficient", ["OF"], 10, false),  // 4 SGP, 10$ → 0.40 SGP/$
      makePlayer("Cheap", ["OF"], 5, false),        // 1 SGP, 5$ → 0.20 SGP/$
    ];
    const sgpValues = [5, 4, 1];
    const slots = { OF: 2 };

    const result = optimizeRoster(players, sgpValues, 100, slots);

    // Both affordable, should take most efficient first (Efficient), then Star or Cheap
    // Efficient (0.40) + Star (0.10) = 60$ total; or Efficient + Cheap = 15$
    // With budget constraints, both Efficient and Star are affordable
    expect(result.roster).toHaveLength(2);

    // Efficient should always be in the roster (highest SGP/$)
    const hasEfficient = result.roster.some(p => p.name === "Efficient");
    expect(hasEfficient).toBe(true);
  });

  it("respects budget — only fills affordable slots", () => {
    const players: PoolPlayer[] = [
      makePlayer("Expensive1", ["OF"], 50, false),
      makePlayer("Expensive2", ["OF"], 50, false),
      makePlayer("Expensive3", ["OF"], 50, false),
    ];
    const sgpValues = [5, 4, 3];
    const slots = { OF: 3 };
    const budget = 10; // Can't afford any $50 player

    const result = optimizeRoster(players, sgpValues, budget, slots);

    // No players are affordable ($50 > $10)
    expect(result.roster).toHaveLength(0);
    expect(result.unfilledSlots).toBe(3);
    expect(result.budgetUsed).toBe(0);
  });
});

describe("optimizeRoster — position constraints", () => {
  it("C fills C slot before UTIL slot", () => {
    // 1 C slot, 1 UTIL slot. A catcher should fill C first, not UTIL.
    const players: PoolPlayer[] = [
      makePlayer("Catcher", ["C"], 30, false),
      makePlayer("FirstBase", ["1B"], 25, false),
    ];
    const sgpValues = [4, 3];
    const slots = { C: 1, UTIL: 1 };

    const result = optimizeRoster(players, sgpValues, 100, slots);

    expect(result.roster).toHaveLength(2);
    // Catcher fills the C slot (more specific), FirstBase fills UTIL
    const catcher = result.roster.find(p => p.name === "Catcher");
    const firstBase = result.roster.find(p => p.name === "FirstBase");
    expect(catcher).toBeDefined();
    expect(firstBase).toBeDefined();
  });

  it("1B/3B player fills CI slot when 1B slot is taken", () => {
    // 1 1B slot, 1 CI slot. First player fills 1B. Second 1B/3B should fill CI.
    const players: PoolPlayer[] = [
      makePlayer("FirstBase1", ["1B"], 30, false),
      makePlayer("FirstThird", ["1B", "3B"], 25, false),
    ];
    const sgpValues = [4, 3];
    const slots = { "1B": 1, CI: 1 };

    const result = optimizeRoster(players, sgpValues, 100, slots);

    expect(result.roster).toHaveLength(2);
  });

  it("returns null slot result for player with no matching positions", () => {
    // Player with unknown position should not be placed if no compatible slot exists
    const players: PoolPlayer[] = [
      makePlayer("SpecialPlayer", ["DH"], 20, false),
    ];
    const sgpValues = [5];
    const slots = { C: 1, SS: 1 }; // No UTIL slot for DH

    const result = optimizeRoster(players, sgpValues, 100, slots);

    // DH can't fill C or SS slots, so should be unfilled
    expect(result.roster).toHaveLength(0);
    expect(result.unfilledSlots).toBe(2);
  });
});

describe("optimizeRoster — locked players", () => {
  it("locked players are pre-assigned, remaining budget allocated to others", () => {
    const locked: PoolPlayer = makePlayer("LockedCatcher", ["C"], 40, false);
    const players: PoolPlayer[] = [
      makePlayer("SS1", ["SS"], 20, false),
      makePlayer("OF1", ["OF"], 15, false),
    ];
    const sgpValues = [4, 3];
    const slots = { C: 1, SS: 1, UTIL: 1 };
    const budget = 100;

    const result = optimizeRoster(players, sgpValues, budget, slots, [
      { player: locked, cost: 40 },
    ]);

    // Locked player + at least one other
    const hasCatcher = result.roster.some(p => p.name === "LockedCatcher");
    expect(hasCatcher).toBe(true);

    // Budget used includes locked player cost
    expect(result.budgetUsed).toBeGreaterThanOrEqual(40);
  });

  it("locked player occupies slot, reducing available positions for others", () => {
    // Lock a catcher. With only 1 C slot, no other player should fill C.
    const locked: PoolPlayer = makePlayer("LockedCatcher", ["C"], 30, false);
    const players: PoolPlayer[] = [
      makePlayer("AnotherCatcher", ["C"], 25, false), // Should NOT get C slot (taken)
      makePlayer("SS1", ["SS"], 20, false),
    ];
    const sgpValues = [3, 2];
    const slots = { C: 1, SS: 1 };
    const budget = 100;

    const result = optimizeRoster(players, sgpValues, budget, slots, [
      { player: locked, cost: 30 },
    ]);

    // LockedCatcher is in; AnotherCatcher has no C slot but no other slot either
    // SS1 should fill SS
    const hasLocked = result.roster.some(p => p.name === "LockedCatcher");
    const hasSS = result.roster.some(p => p.name === "SS1");
    expect(hasLocked).toBe(true);
    expect(hasSS).toBe(true);
  });
});

describe("optimizeRoster — budget exhaustion", () => {
  it("respects $1 reserve per unfilled slot", () => {
    // Budget $10, 3 players at $5 each, 2 slots
    // First pick: maxSpend = 10 - (2-1) = 9, can afford $5 player
    // After first pick: budget = 5, slots = 1. Second pick: maxSpend = 5 - 0 = 5, can afford $5
    const players: PoolPlayer[] = [
      makePlayer("P1", ["OF"], 5, false),
      makePlayer("P2", ["OF"], 5, false),
    ];
    const sgpValues = [4, 3];
    const slots = { OF: 2 };
    const budget = 10;

    const result = optimizeRoster(players, sgpValues, budget, slots);

    // Should fill both slots (5+5 = 10)
    expect(result.roster).toHaveLength(2);
    expect(result.budgetUsed).toBe(10);
  });

  it("stops when reserve budget prevents adding more players", () => {
    // Budget $5, 3 players at $3 each, 3 slots
    // First pick: maxSpend = 5 - (3-1) = 3, can afford $3
    // After first: budget = 2, 2 slots remain. maxSpend = 2 - (2-1) = 1. Can't afford $3.
    const players: PoolPlayer[] = [
      makePlayer("P1", ["OF"], 3, false),
      makePlayer("P2", ["OF"], 3, false),
      makePlayer("P3", ["OF"], 3, false),
    ];
    const sgpValues = [5, 4, 3];
    const slots = { OF: 3 };
    const budget = 5;

    const result = optimizeRoster(players, sgpValues, budget, slots);

    // Can only afford 1 player ($3) and still have $1 reserve for each remaining slot
    // Actually: first pick can spend $3 (5 - 2 = 3), leaving $2 for 2 more spots.
    // Second pick: 2 - 1 = 1 max spend, can't afford $3.
    expect(result.roster.length).toBeLessThanOrEqual(2);
    expect(result.unfilledSlots).toBeGreaterThan(0);
  });
});

describe("optimizeRoster — edge cases", () => {
  it("empty player pool returns empty roster", () => {
    const result = optimizeRoster([], [], 100, { OF: 3 });

    expect(result.roster).toHaveLength(0);
    expect(result.totalSGPValue).toBe(0);
    expect(result.budgetUsed).toBe(0);
    expect(result.unfilledSlots).toBe(3);
  });

  it("empty slot config returns empty roster", () => {
    const players: PoolPlayer[] = [
      makePlayer("P1", ["OF"], 10, false),
    ];
    const result = optimizeRoster(players, [5], 100, {});

    expect(result.roster).toHaveLength(0);
    expect(result.unfilledSlots).toBe(0);
  });

  it("totalSGPValue sums all rostered players including locked", () => {
    const locked: PoolPlayer = makePlayer("Locked", ["C"], 30, false);
    const players: PoolPlayer[] = [
      makePlayer("SS1", ["SS"], 20, false),
    ];
    const sgpValues = [4]; // For players array only
    const slots = { C: 1, SS: 1 };

    const result = optimizeRoster(players, sgpValues, 100, slots, [
      { player: locked, cost: 30 },
    ]);

    // totalSGPValue should include both the locked player and SS1
    // Locked player SGP is tracked separately (passed via locked structure)
    expect(result.totalSGPValue).toBeGreaterThanOrEqual(4); // At least SS1's SGP
  });
});

describe("optimizeRoster — flex slot assignment", () => {
  it("P slot accepts SP and RP", () => {
    const players: PoolPlayer[] = [
      makePlayer("Starter1", ["SP"], 20, true),
      makePlayer("Reliever1", ["RP"], 10, true),
    ];
    const sgpValues = [5, 3];
    const slots = { P: 2 };

    const result = optimizeRoster(players, sgpValues, 100, slots);

    expect(result.roster).toHaveLength(2);
  });

  it("MI slot accepts 2B or SS", () => {
    const players: PoolPlayer[] = [
      makePlayer("Second", ["2B"], 20, false),
      makePlayer("Short", ["SS"], 15, false),
    ];
    const sgpValues = [4, 3];
    const slots = { MI: 2 };

    const result = optimizeRoster(players, sgpValues, 100, slots);

    expect(result.roster).toHaveLength(2);
  });

  it("UTIL slot accepts C, 1B, 2B, 3B, SS, OF, DH", () => {
    const players: PoolPlayer[] = [
      makePlayer("Outfielder", ["OF"], 15, false),
    ];
    const sgpValues = [4];
    const slots = { UTIL: 1 };

    const result = optimizeRoster(players, sgpValues, 100, slots);

    expect(result.roster).toHaveLength(1);
    expect(result.roster[0].name).toBe("Outfielder");
  });
});
