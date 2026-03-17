/**
 * roster-constraints.test.ts
 *
 * Focused tests for constraint enforcement in optimizeRoster.
 * Covers: budget limits, slot filling, position eligibility, SP tier caps,
 * locked players, and backfill behavior.
 *
 * Complements roster-optimizer.test.ts which covers basic SGP/$ efficiency.
 */

import { describe, it, expect } from "vitest";
import { optimizeRoster } from "../roster-optimizer";
import type { PoolPlayer } from "../types";

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

/**
 * Build a pool of ~20 players covering all positions with varied dollar values.
 * Used as the base pool for most constraint tests.
 */
function makeFullPool(): { players: PoolPlayer[]; sgpValues: number[] } {
  const players: PoolPlayer[] = [
    // Catchers
    makePlayer("Catcher1", ["C"], 20),
    makePlayer("Catcher2", ["C"], 8),
    makePlayer("Catcher3", ["C"], 3),
    // First Base
    makePlayer("FirstBase1", ["1B"], 22),
    makePlayer("FirstBase2", ["1B"], 10),
    // Second Base
    makePlayer("SecondBase1", ["2B"], 18),
    makePlayer("SecondBase2", ["2B"], 7),
    // Third Base
    makePlayer("ThirdBase1", ["3B"], 15),
    makePlayer("ThirdBase2", ["3B"], 5),
    // Shortstop
    makePlayer("Shortstop1", ["SS"], 25),
    makePlayer("Shortstop2", ["SS"], 9),
    // Outfield
    makePlayer("Outfield1", ["OF"], 30),
    makePlayer("Outfield2", ["OF"], 20),
    makePlayer("Outfield3", ["OF"], 12),
    makePlayer("Outfield4", ["OF"], 6),
    // Starting Pitchers
    makePlayer("SP1", ["SP"], 16, true),
    makePlayer("SP2", ["SP"], 10, true),
    makePlayer("SP3", ["SP"], 7, true),
    makePlayer("SP4", ["SP"], 4, true),
    makePlayer("SP5", ["SP"], 2, true),
    makePlayer("SP6", ["SP"], 1, true),
  ];

  const sgpValues = players.map(p => p.dollars * 0.15);
  return { players, sgpValues };
}

/** Standard 10-slot roster for budget tests */
const tenSlotRoster: Record<string, number> = {
  C: 1,
  "1B": 1,
  SS: 1,
  OF: 3,
  SP: 2,
  UTIL: 1,
  BN: 1,
};

// ============================================================
// Budget constraint tests
// ============================================================

describe("optimizeRoster — budget constraint enforcement", () => {
  it("never exceeds budget: sum of player dollars <= budget", () => {
    const { players, sgpValues } = makeFullPool();
    // Sum of all player dollars far exceeds $200
    const budget = 200;

    const result = optimizeRoster(players, sgpValues, budget, {
      C: 1, "1B": 1, "2B": 1, "3B": 1, SS: 1, OF: 3, SP: 3, UTIL: 1,
    });

    expect(result.budgetUsed).toBeLessThanOrEqual(budget);
  });

  it("reserves $1 per unfilled slot: expensive player skipped when it would violate reserve", () => {
    // Budget=$5, 3 OF slots. Pool: [$4 Expensive, $1 Cheap A, $1 Cheap B, $1 Cheap C]
    // Sort by efficiency: Cheap players (SGP=1.0 each at $1) > Expensive (SGP=0.5 at $4).
    // Greedy iteration (efficiency order): CheapA, CheapB, CheapC then Expensive.
    //   CheapA: maxSpend=5-(3-1)=3, $1 fits. budget=4, slotsToFill=2.
    //   CheapB: maxSpend=4-(2-1)=3, $1 fits. budget=3, slotsToFill=1.
    //   CheapC: maxSpend=3-(1-1)=3, $1 fits. budget=2, slotsToFill=0. DONE.
    // All 3 slots filled before reaching Expensive → Expensive NOT selected.
    // Backfill does nothing (slotsToFill=0).
    const players: PoolPlayer[] = [
      makePlayer("Expensive", ["OF"], 4),
      makePlayer("Cheap A", ["OF"], 1),
      makePlayer("Cheap B", ["OF"], 1),
      makePlayer("Cheap C", ["OF"], 1),
    ];
    const sgpValues = [0.5, 1, 1, 1]; // Cheap players have higher efficiency
    const budget = 5;
    const slots: Record<string, number> = { OF: 3 };

    const result = optimizeRoster(players, sgpValues, budget, slots);

    // All 3 OF slots filled by the cheap $1 players
    expect(result.roster).toHaveLength(3);
    expect(result.unfilledSlots).toBe(0);

    // Expensive player is NOT selected (cheap players fill all slots first)
    const hasExpensive = result.roster.some(p => p.name === "Expensive");
    expect(hasExpensive).toBe(false);
    expect(result.budgetUsed).toBeLessThanOrEqual(budget);
  });

  it("fills cheapest $1 players when budget is tight: budget=$10, 10 slots → all filled with $1s", () => {
    // Build a pool of 10 $1 players covering all positions
    const players: PoolPlayer[] = [
      makePlayer("C1", ["C"], 1),
      makePlayer("1B1", ["1B"], 1),
      makePlayer("2B1", ["2B"], 1),
      makePlayer("3B1", ["3B"], 1),
      makePlayer("SS1", ["SS"], 1),
      makePlayer("OF1", ["OF"], 1),
      makePlayer("OF2", ["OF"], 1),
      makePlayer("OF3", ["OF"], 1),
      makePlayer("SP1", ["SP"], 1, true),
      makePlayer("SP2", ["SP"], 1, true),
    ];
    const sgpValues = players.map(() => 0.2);
    const budget = 10;
    const slots: Record<string, number> = {
      C: 1, "1B": 1, "2B": 1, "3B": 1, SS: 1, OF: 3, SP: 2,
    };

    const result = optimizeRoster(players, sgpValues, budget, slots);

    // All 10 $1 players should fit in 10 slots with $10 budget
    expect(result.roster).toHaveLength(10);
    expect(result.unfilledSlots).toBe(0);
    expect(result.budgetUsed).toBe(10);
  });
});

// ============================================================
// Slot filling tests
// ============================================================

describe("optimizeRoster — slot filling behavior", () => {
  it("fills all positions when pool has enough players: 12-slot roster, 20+ player pool → 0 unfilled", () => {
    const { players, sgpValues } = makeFullPool();
    const fullSlots: Record<string, number> = {
      C: 1, "1B": 1, "2B": 1, "3B": 1, SS: 1, OF: 3, SP: 2, UTIL: 1, BN: 1,
    }; // 12 slots

    const result = optimizeRoster(players, sgpValues, 500, fullSlots);

    expect(result.unfilledSlots).toBe(0);
  });

  it("respects position eligibility: C-only player does not fill SS or OF slots", () => {
    const players: PoolPlayer[] = [
      makePlayer("PureCatcher", ["C"], 15),
      makePlayer("Shortstop", ["SS"], 10),
    ];
    const sgpValues = [3, 2];
    const slots: Record<string, number> = { C: 1, SS: 1, OF: 1 };

    const result = optimizeRoster(players, sgpValues, 100, slots);

    // PureCatcher fills C, Shortstop fills SS. OF stays unfilled (no OF-eligible player).
    const catcherSlot = result.slotAssignments[result.roster.findIndex(p => p.name === "PureCatcher")];
    expect(catcherSlot).toBe("C");

    const ssSlot = result.slotAssignments[result.roster.findIndex(p => p.name === "Shortstop")];
    expect(ssSlot).toBe("SS");

    // OF slot should remain unfilled
    expect(result.unfilledSlots).toBe(1);
  });

  it("most-restrictive slot fills first: C player fills C slot before UTIL when both open", () => {
    // A catcher should fill C (dedicated) before UTIL (flex).
    // SLOT_PRIORITY has C before UTIL, so findBestSlot returns C first.
    const players: PoolPlayer[] = [
      makePlayer("Catcher", ["C"], 20),
      makePlayer("FirstBase", ["1B"], 15),
    ];
    const sgpValues = [4, 3];
    const slots: Record<string, number> = { C: 1, UTIL: 1 };

    const result = optimizeRoster(players, sgpValues, 100, slots);

    // Catcher should be assigned to C slot, not UTIL
    const catcherIdx = result.roster.findIndex(p => p.name === "Catcher");
    expect(result.slotAssignments[catcherIdx]).toBe("C");

    // FirstBase fills UTIL (1B is eligible for UTIL)
    const fbIdx = result.roster.findIndex(p => p.name === "FirstBase");
    expect(result.slotAssignments[fbIdx]).toBe("UTIL");
  });
});

// ============================================================
// SP tier cap tests
// ============================================================

describe("optimizeRoster — SP tier cap enforcement", () => {
  it("SP1 slot (0 SPs drafted): allows up to $18 pitcher", () => {
    // With no SPs locked, tier 1 cap is $18. A $16 SP should be selected.
    const players: PoolPlayer[] = [
      makePlayer("Ace SP", ["SP"], 16, true),  // $16 ≤ $18 cap → allowed
      makePlayer("Filler C", ["C"], 5),
    ];
    const sgpValues = [3, 1];
    const slots: Record<string, number> = { SP: 1, C: 1 };

    const result = optimizeRoster(players, sgpValues, 100, slots);

    // $16 SP is within tier 1 cap ($18), should be selected
    const hasAce = result.roster.some(p => p.name === "Ace SP");
    expect(hasAce).toBe(true);
  });

  it("SP3 cap ($10): with 2 SPs already drafted (locked), $15 SP is rejected in greedy", () => {
    // Lock 2 SPs via lockedPlayers → spCount becomes 2.
    // Tier 3 cap = $10. A $15 SP should be SKIPPED (exceeds cap).
    // A $7 SP should be selected instead.
    const lockedSP1 = makePlayer("Locked SP1", ["SP"], 16, true);
    const lockedSP2 = makePlayer("Locked SP2", ["SP"], 12, true);

    const players: PoolPlayer[] = [
      makePlayer("Expensive SP", ["SP"], 15, true), // $15 > $10 tier 3 cap → rejected
      makePlayer("Cheap SP", ["SP"], 7, true),       // $7 ≤ $10 tier 3 cap → accepted
      makePlayer("Filler OF", ["OF"], 5),
    ];
    const sgpValues = [3, 1.5, 1];
    const slots: Record<string, number> = { SP: 3, OF: 1 };

    const result = optimizeRoster(
      players,
      sgpValues,
      100,
      slots,
      [
        { player: lockedSP1, cost: 16 },
        { player: lockedSP2, cost: 12 },
      ],
    );

    // Expensive SP ($15) exceeds tier 3 cap ($10), should not be in roster
    const hasExpensiveSP = result.roster.some(p => p.name === "Expensive SP");
    expect(hasExpensiveSP).toBe(false);

    // Cheap SP ($7) is within tier 3 cap, should be selected
    const hasCheapSP = result.roster.some(p => p.name === "Cheap SP");
    expect(hasCheapSP).toBe(true);
  });

  it("tier cap clamps to SP5 ($3) for 4+ drafted SPs: only $1-3 pitchers accepted", () => {
    // Lock 4 SPs → spCount=4. Tier 5 cap = $3.
    // Slots: SP:6 + C:1. After locking 4 SPs, 2 SP slots + 1 C slot remain.
    // Pool: OverCap ($5), AtCap ($3), UnderCap ($1), FillerC ($5)
    // OverCap exceeds tier 5 cap → rejected. AtCap and UnderCap both fit → selected.
    const lockedSPs = [
      makePlayer("LockedSP1", ["SP"], 18, true),
      makePlayer("LockedSP2", ["SP"], 12, true),
      makePlayer("LockedSP3", ["SP"], 8, true),
      makePlayer("LockedSP4", ["SP"], 4, true),
    ];

    const players: PoolPlayer[] = [
      makePlayer("OverCap SP", ["SP"], 5, true),   // $5 > $3 tier 5 cap → rejected
      makePlayer("AtCap SP", ["SP"], 3, true),      // $3 === $3 cap → accepted
      makePlayer("UnderCap SP", ["SP"], 1, true),   // $1 < $3 cap → accepted
      makePlayer("Filler C", ["C"], 5),
    ];
    const sgpValues = [1, 0.6, 0.2, 1];
    // 6 SP slots + 1 C slot = 7 total. 4 locked SPs fill 4 SP slots. 2 SP + 1 C remain.
    const slots: Record<string, number> = { SP: 6, C: 1 };

    const result = optimizeRoster(
      players,
      sgpValues,
      200,
      slots,
      lockedSPs.map(p => ({ player: p, cost: p.dollars })),
    );

    // OverCap SP ($5) should be rejected (exceeds tier 5 cap of $3)
    const hasOverCap = result.roster.some(p => p.name === "OverCap SP");
    expect(hasOverCap).toBe(false);

    // AtCap SP ($3) and UnderCap SP ($1) both within tier 5 cap → both accepted
    const hasAtCap = result.roster.some(p => p.name === "AtCap SP");
    const hasUnderCap = result.roster.some(p => p.name === "UnderCap SP");
    expect(hasAtCap).toBe(true);
    expect(hasUnderCap).toBe(true);
  });
});

// ============================================================
// Locked players tests
// ============================================================

describe("optimizeRoster — locked players", () => {
  it("locked players consume their slot and reduce available budget", () => {
    const lockedOF = makePlayer("LockedStar", ["OF"], 30);
    const players: PoolPlayer[] = [
      makePlayer("Shortstop", ["SS"], 20),
      makePlayer("FirstBase", ["1B"], 15),
    ];
    const sgpValues = [4, 3];
    const slots: Record<string, number> = { OF: 1, SS: 1, "1B": 1 };
    const budget = 100;

    const result = optimizeRoster(
      players,
      sgpValues,
      budget,
      slots,
      [{ player: lockedOF, cost: 30 }],
    );

    // Locked player is in roster
    const hasLocked = result.roster.some(p => p.name === "LockedStar");
    expect(hasLocked).toBe(true);

    // Budget includes locked player cost
    expect(result.budgetUsed).toBeGreaterThanOrEqual(30);

    // OF slot was consumed by locked player — only SS and 1B should be filled by pool
    const assignments = result.slotAssignments;
    const ofSlotIndex = result.roster.findIndex(p => p.name === "LockedStar");
    expect(assignments[ofSlotIndex]).toBe("OF");
  });

  it("locked player SGP is not part of greedy fill SGP sum", () => {
    // The locked player's SGP is NOT added to totalSGPValue by optimizeRoster.
    // The caller (computeMaxBid) adds it separately via sgpValues[nominatedIndex].
    // So totalSGPValue should only contain SGP from the greedy-filled players.
    const lockedOF = makePlayer("Locked", ["OF"], 30);
    const players: PoolPlayer[] = [
      makePlayer("SS1", ["SS"], 20),
    ];
    const sgpValues = [4]; // Only SS1's SGP in greedy fill
    const slots: Record<string, number> = { OF: 1, SS: 1 };

    const result = optimizeRoster(
      players,
      sgpValues,
      100,
      slots,
      [{ player: lockedOF, cost: 30 }],
    );

    // totalSGPValue = SS1's SGP (4), NOT SS1 + locked player's SGP
    // (Locked player was passed via lockedPlayers with no associated SGP)
    expect(result.totalSGPValue).toBeCloseTo(4, 5);
  });

  it("locked player occupies slot so no other player can fill it", () => {
    // Lock a catcher. The pool also has another catcher.
    // Second catcher should NOT fill C (slot consumed). They must find another slot or be excluded.
    const lockedCatcher = makePlayer("LockedCatcher", ["C"], 20);
    const players: PoolPlayer[] = [
      makePlayer("AnotherCatcher", ["C"], 15),  // Only C-eligible
      makePlayer("Shortstop", ["SS"], 10),
    ];
    const sgpValues = [3, 2];
    const slots: Record<string, number> = { C: 1, SS: 1 };

    const result = optimizeRoster(
      players,
      sgpValues,
      100,
      slots,
      [{ player: lockedCatcher, cost: 20 }],
    );

    const hasLockedCatcher = result.roster.some(p => p.name === "LockedCatcher");
    const hasSS = result.roster.some(p => p.name === "Shortstop");
    expect(hasLockedCatcher).toBe(true);
    expect(hasSS).toBe(true);

    // AnotherCatcher cannot fill C (taken) and has no other slot → excluded
    const hasAnotherCatcher = result.roster.some(p => p.name === "AnotherCatcher");
    expect(hasAnotherCatcher).toBe(false);
  });
});

// ============================================================
// Backfill pass tests
// ============================================================

describe("optimizeRoster — backfill pass behavior", () => {
  it("backfill fills slots when reserve math blocks greedy fill", () => {
    // Budget=$8, 3 OF slots. Pool: [$3@SGP4, $3@SGP3, $3@SGP2]
    // Greedy: $3 player 1 (maxSpend=8-2=6, fits). Budget=5, 2 slots.
    //   Player2 (SGP3): maxSpend=5-1=4, $3 fits. Budget=2, 1 slot.
    //   Player3 (SGP2): maxSpend=2-0=2, $3>2 SKIP. 1 slot unfilled.
    // Backfill: force place Player3 regardless of budget.
    const players: PoolPlayer[] = [
      makePlayer("HighSGP", ["OF"], 3),   // picked in greedy
      makePlayer("MidSGP", ["OF"], 3),    // picked in greedy
      makePlayer("LowSGP", ["OF"], 3),    // skipped by greedy, picked by backfill
    ];
    const sgpValues = [4, 3, 2];
    const slots: Record<string, number> = { OF: 3 };

    const result = optimizeRoster(players, sgpValues, 8, slots);

    expect(result.roster).toHaveLength(3);
    expect(result.unfilledSlots).toBe(0);

    // All three should be in roster (backfill placed LowSGP)
    const hasLowSGP = result.roster.some(p => p.name === "LowSGP");
    expect(hasLowSGP).toBe(true);
  });

  it("backfill fills dedicated slots when no eligible player was picked by greedy", () => {
    // The SS slot requires an SS player. Budget is tight, so greedy skips the SS.
    // Backfill should force-place the cheapest SS.
    const players: PoolPlayer[] = [
      makePlayer("ExpensiveSS", ["SS"], 20),
      makePlayer("CheapSS", ["SS"], 5),
      makePlayer("OF1", ["OF"], 3),
      makePlayer("OF2", ["OF"], 3),
      makePlayer("OF3", ["OF"], 3),
    ];
    const sgpValues = [4, 1, 0.6, 0.6, 0.6];
    // Budget forces greedy to skip ExpensiveSS. CheapSS also skipped by reserve math.
    // Backfill places CheapSS.
    const slots: Record<string, number> = { SS: 1, OF: 3 };

    // Tight budget: 4 slots, budget $12
    // Greedy: OF1 efficiency=0.2 ok (maxSpend=12-3=9, $3 fits), etc.
    // After 3 OFs: budget=3, 1 slot. CheapSS: maxSpend=3-0=3, $5>3 SKIP. ExpensiveSS: $20>3 SKIP.
    // Backfill: SS slot unfilled, cheapest SS = CheapSS ($5). Force place.
    const result = optimizeRoster(players, sgpValues, 12, slots);

    expect(result.unfilledSlots).toBe(0);
    const hasCheapSS = result.roster.some(p => p.name === "CheapSS");
    expect(hasCheapSS).toBe(true);
  });

  it("backfill prefers tier-cap-compliant SPs over expensive ones when SP slots need filling", () => {
    // With 2 locked SPs, tier 3 cap = $10.
    // Pool has two SPs: $12 (over cap) and $8 (within cap).
    // Greedy skips both due to budget pressure. Backfill prefers $8 (within tier cap).
    const lockedSP1 = makePlayer("LS1", ["SP"], 18, true);
    const lockedSP2 = makePlayer("LS2", ["SP"], 12, true);

    const players: PoolPlayer[] = [
      makePlayer("OverCapSP", ["SP"], 12, true), // $12 > $10 tier 3 cap
      makePlayer("WithinCapSP", ["SP"], 8, true), // $8 ≤ $10 tier 3 cap
      makePlayer("Filler OF", ["OF"], 1),
    ];
    const sgpValues = [2.4, 1.6, 0.2];

    // Slots need 1 more SP slot (2 already locked, 1 remaining SP slot)
    const slots: Record<string, number> = { SP: 3, OF: 1 };

    // Budget: very tight so greedy can't pick the SPs
    // With locked players costing 18+12=30, remaining budget = 1
    // Greedy: slotsToFill=2 (1 SP + 1 OF). maxSpend=1-(2-1)=0 → no one fits.
    // Backfill: SP slot → prefers within-cap ($8) over over-cap ($12)
    const result = optimizeRoster(
      players,
      sgpValues,
      1, // remaining budget (very tight — forces backfill)
      slots,
      [
        { player: lockedSP1, cost: 18 },
        { player: lockedSP2, cost: 12 },
      ],
    );

    // WithinCapSP should be preferred in backfill over OverCapSP
    const hasWithinCap = result.roster.some(p => p.name === "WithinCapSP");
    expect(hasWithinCap).toBe(true);

    // unfilledSlots = 0 (backfill fills everything)
    expect(result.unfilledSlots).toBe(0);
  });
});
