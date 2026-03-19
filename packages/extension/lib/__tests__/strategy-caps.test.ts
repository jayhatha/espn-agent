import { describe, it, expect } from "vitest";
import {
  computeStrategyBidCap,
  determineSlotDestination,
  type StrategyCapInput,
} from "../engine/strategy-caps";

// ============================================================
// Helpers
// ============================================================

function makeInput(overrides: Partial<StrategyCapInput> = {}): StrategyCapInput {
  return {
    rawMaxBid: 20,
    isPitcher: false,
    isSP: false,
    positions: ["OF"],
    primaryPosition: "OF",
    spCount: 0,
    catcherSlotsRemaining: 1,
    isEndgame: false,
    inflationFactor: 1.0,
    hitterSpent: 0,
    pitcherSpent: 0,
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe("computeStrategyBidCap — positional weight bonus", () => {
  it("adds +4 for SS", () => {
    const result = computeStrategyBidCap(makeInput({ positions: ["SS"] }));
    expect(result.bidCap).toBe(24); // 20 + 4
    expect(result.capSource).toContain("pos +4");
  });

  it("adds +3 for OF", () => {
    const result = computeStrategyBidCap(makeInput({ positions: ["OF"] }));
    expect(result.bidCap).toBe(23); // 20 + 3
    expect(result.capSource).toContain("pos +3");
  });

  it("adds +3 for 3B", () => {
    const result = computeStrategyBidCap(makeInput({ positions: ["3B"] }));
    expect(result.bidCap).toBe(23); // 20 + 3
  });

  it("uses max weight for multi-position (SS/2B → +4)", () => {
    const result = computeStrategyBidCap(makeInput({ positions: ["2B", "SS"] }));
    expect(result.bidCap).toBe(24); // 20 + max(2,4)
    expect(result.capSource).toContain("pos +4");
  });

  it("adds +1 for C (when slot not filled)", () => {
    const result = computeStrategyBidCap(
      makeInput({ positions: ["C"], primaryPosition: "C", catcherSlotsRemaining: 1 }),
    );
    expect(result.bidCap).toBe(21); // 20 + 1
    expect(result.capSource).toContain("pos +1");
  });

  it("adds no bonus for pitchers", () => {
    const result = computeStrategyBidCap(
      makeInput({ positions: ["SP"], isPitcher: true, isSP: true }),
    );
    // No positional weight for SP, but SP tier cap applies (SP1 = $18)
    expect(result.bidCap).toBe(18);
  });
});

describe("computeStrategyBidCap — catcher dampening", () => {
  it("halves bid when C slot already filled", () => {
    const result = computeStrategyBidCap(
      makeInput({ positions: ["C"], primaryPosition: "C", catcherSlotsRemaining: 0 }),
    );
    // 20 × 0.5 = 10, then +1 (C pos weight) = 11
    expect(result.bidCap).toBe(11);
    expect(result.capSource).toContain("C filled ×0.5");
  });

  it("does not dampen when C slot is open", () => {
    const result = computeStrategyBidCap(
      makeInput({ positions: ["C"], primaryPosition: "C", catcherSlotsRemaining: 1 }),
    );
    // 20 + 1 (C pos weight) = 21, no dampening
    expect(result.bidCap).toBe(21);
    expect(result.capSource).not.toContain("C filled");
  });

  it("does not dampen non-catchers even if C slot filled", () => {
    const result = computeStrategyBidCap(
      makeInput({ positions: ["OF"], primaryPosition: "OF", catcherSlotsRemaining: 0 }),
    );
    expect(result.bidCap).toBe(23); // 20 + 3 (OF weight)
    expect(result.capSource).not.toContain("C filled");
  });
});

describe("computeStrategyBidCap — SP tier caps", () => {
  it("caps SP1 at $18", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, isPitcher: true, isSP: true, spCount: 0 }),
    );
    expect(result.bidCap).toBe(18);
    expect(result.capSource).toContain("SP1 cap $18");
  });

  it("caps SP2 at $12", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, isPitcher: true, isSP: true, spCount: 1 }),
    );
    expect(result.bidCap).toBe(12);
    expect(result.capSource).toContain("SP2 cap $12");
  });

  it("caps SP3 at $10", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, isPitcher: true, isSP: true, spCount: 2 }),
    );
    expect(result.bidCap).toBe(10);
  });

  it("caps SP4 at $5", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, isPitcher: true, isSP: true, spCount: 3 }),
    );
    expect(result.bidCap).toBe(5);
  });

  it("caps SP5+ at $3", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, isPitcher: true, isSP: true, spCount: 4 }),
    );
    expect(result.bidCap).toBe(3);
  });

  it("caps RP at $15 hard max", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, isPitcher: true, isSP: false, positions: ["RP"] }),
    );
    // RP: no SP tier cap, but hard RP cap at $15 — relievers are replaceable
    expect(result.bidCap).toBe(15);
    expect(result.capSource).toContain("RP cap $15");
  });
});

describe("computeStrategyBidCap — hitter budget cap", () => {
  it("caps bid when hitterSpent + bid would exceed $220", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, hitterSpent: 205, positions: ["OF"] }),
    );
    // Headroom: 220 - 205 = 15. rawMaxBid 30 + pos 3 = 33, capped to 15.
    expect(result.bidCap).toBe(15);
    expect(result.capSource).toContain("hitter cap $220");
  });

  it("does not cap when under budget", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 20, hitterSpent: 100, positions: ["OF"] }),
    );
    // 20 + 3 (OF weight) = 23, 100 + 23 = 123 < 200 → no cap
    expect(result.bidCap).toBe(23);
    expect(result.capSource).not.toContain("hitter cap");
  });

  it("does not apply hitter cap to pitchers", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, hitterSpent: 195, isPitcher: true, isSP: true, spCount: 0 }),
    );
    // SP1 cap ($18) applies, but hitter cap does not
    expect(result.bidCap).toBe(18);
    expect(result.capSource).not.toContain("hitter cap");
  });

  it("does not apply hitter cap in endgame", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 20, hitterSpent: 195, isEndgame: true, positions: ["OF"] }),
    );
    // Endgame: hitter cap skipped, then endgame dampening: (20+3) * 0.7 = ceil(16.1) = 17
    expect(result.bidCap).toBe(17);
    expect(result.capSource).not.toContain("hitter cap");
    expect(result.capSource).toContain("endgame");
  });
});

describe("computeStrategyBidCap — endgame dampening", () => {
  it("applies 30% reduction when endgame active", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 20, isEndgame: true, positions: ["OF"] }),
    );
    // 20 + 3 (OF) = 23, × 0.7 = 16.1, ceil = 17
    expect(result.bidCap).toBe(17);
    expect(result.capSource).toContain("endgame ×0.7");
  });

  it("floors at $1", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 1, isEndgame: true, positions: ["SP"], isPitcher: true, isSP: true, spCount: 4 }),
    );
    // rawMaxBid 1, SP5+ cap $3 (no effect since 1 < 3), endgame: ceil(1 * 0.7) = 1
    expect(result.bidCap).toBeGreaterThanOrEqual(1);
  });
});

describe("computeStrategyBidCap — inflation adjustment", () => {
  it("adds +2 when inflation > 1.10", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 20, inflationFactor: 1.15, positions: ["OF"] }),
    );
    // 20 + 3 (OF) + 2 (inflation) = 25
    expect(result.bidCap).toBe(25);
    expect(result.capSource).toContain("inflation +2");
  });

  it("does not add inflation bonus at exactly 1.10", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 20, inflationFactor: 1.1, positions: ["OF"] }),
    );
    // 20 + 3 (OF) = 23, no inflation bonus (must be strictly > 1.10)
    expect(result.bidCap).toBe(23);
    expect(result.capSource).not.toContain("inflation");
  });

  it("does not add inflation bonus below 1.10", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 20, inflationFactor: 1.0, positions: ["OF"] }),
    );
    expect(result.bidCap).toBe(23);
    expect(result.capSource).not.toContain("inflation");
  });
});

describe("computeStrategyBidCap — combined adjustments", () => {
  it("applies all caps in correct order for endgame SS with high inflation", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 30,
        positions: ["SS"],
        isEndgame: true,
        inflationFactor: 1.20,
        remainingSlots: { SS: 1, MI: 1, UTIL: 3 },
      }),
    );
    // 30 >= elite threshold, need = 1.0 (dedicated slot anyway)
    // 30 + 4 (SS weight) = 34
    // Hitter cap skipped in endgame
    // Endgame: ceil(34 * 0.7) = ceil(23.8) = 24
    // Inflation: 24 + 2 = 26
    expect(result.bidCap).toBe(26);
    expect(result.capSource).toContain("pos +4");
    expect(result.capSource).toContain("endgame");
    expect(result.capSource).toContain("inflation +2");
  });

  it("applies catcher dampening then positional weight then hitter cap", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 40,
        positions: ["C"],
        primaryPosition: "C",
        catcherSlotsRemaining: 0,
        hitterSpent: 210,
        remainingSlots: { C: 0, UTIL: 1 },
      }),
    );
    // 40 >= elite threshold → need ×1.0 (elite override, UTIL)
    // 40 × 0.5 = 20 (C filled dampening)
    // 20 + 1 (C weight — UTIL slot available) = no, C slot=0 and UTIL available means pos weight check
    // Actually pos weight: C has dedicated=0, no flex for C, but UTIL>0 → no dedicated slot → pos +0
    // 20 + 0 (pos +0 slots full) = 20
    // Hitter cap: 210 + 20 = 230 > 220, headroom = 10 → cap to 10
    expect(result.bidCap).toBe(10);
    expect(result.capSource).toContain("C filled");
    expect(result.capSource).toContain("hitter cap");
  });

  it("SP with endgame and inflation gets all three adjustments", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 25,
        isPitcher: true,
        isSP: true,
        positions: ["SP"],
        spCount: 1, // SP2 cap = $12
        isEndgame: true,
        inflationFactor: 1.15,
        remainingSlots: { P: 5 },
      }),
    );
    // P slots available → no pitcher BN dampening
    // 25, no pos weight (SP=0)
    // SP2 cap: min(25, 12) = 12
    // Endgame: ceil(12 * 0.7) = ceil(8.4) = 9
    // Inflation: 9 + 2 = 11
    expect(result.bidCap).toBe(11);
    expect(result.capSource).toContain("SP2 cap $12");
    expect(result.capSource).toContain("endgame");
    expect(result.capSource).toContain("inflation +2");
  });
});

// ============================================================
// Need Multiplier Tests
// ============================================================

describe("determineSlotDestination", () => {
  it("returns dedicated when player has a matching dedicated slot", () => {
    expect(determineSlotDestination(["SS"], { SS: 1, MI: 1, UTIL: 3 }, false)).toBe("dedicated");
  });

  it("returns flex when dedicated full but MI available for SS", () => {
    expect(determineSlotDestination(["SS"], { SS: 0, MI: 1, UTIL: 3 }, false)).toBe("flex");
  });

  it("returns flex when dedicated full but CI available for 1B", () => {
    expect(determineSlotDestination(["1B"], { "1B": 0, CI: 1, UTIL: 2 }, false)).toBe("flex");
  });

  it("returns UTIL when dedicated and flex full", () => {
    expect(determineSlotDestination(["SS"], { SS: 0, MI: 0, UTIL: 1 }, false)).toBe("UTIL");
  });

  it("returns BN when no slots available", () => {
    expect(determineSlotDestination(["OF"], { OF: 0, UTIL: 0 }, false)).toBe("BN");
  });

  it("returns dedicated for pitcher with P slots", () => {
    expect(determineSlotDestination(["SP"], { P: 3 }, true)).toBe("dedicated");
  });

  it("returns BN for pitcher with no P slots", () => {
    expect(determineSlotDestination(["SP"], { P: 0 }, true)).toBe("BN");
  });
});

describe("computeStrategyBidCap — need multiplier", () => {
  it("reduces bid ×0.7 when player would go to UTIL (all dedicated + flex full)", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 20,
        positions: ["OF"],
        remainingSlots: { OF: 0, UTIL: 1 },
      }),
    );
    // 20 × 0.7 = 14, then pos +0 (OF full) = 14
    expect(result.bidCap).toBe(14);
    expect(result.capSource).toContain("need ×0.7 (UTIL)");
  });

  it("reduces bid ×0.5 when player would go to BN (no slots at all)", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 20,
        positions: ["OF"],
        remainingSlots: { OF: 0, UTIL: 0 },
      }),
    );
    // 20 × 0.5 = 10, then pos +0 (OF full) = 10
    expect(result.bidCap).toBe(10);
    expect(result.capSource).toContain("need ×0.5 (BN)");
  });

  it("does not reduce bid for dedicated slot fill", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 20,
        positions: ["OF"],
        remainingSlots: { OF: 2, UTIL: 3 },
      }),
    );
    // No need reduction — dedicated slot. 20 + 3 (OF weight) = 23
    expect(result.bidCap).toBe(23);
    expect(result.capSource).not.toContain("need");
  });

  it("does not reduce bid for flex slot fill (MI for SS)", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 20,
        positions: ["SS"],
        remainingSlots: { SS: 0, MI: 1, UTIL: 2 },
      }),
    );
    // Flex slot — no need reduction. 20 + 4 (SS weight via MI flex) = 24
    // But pos weight check: SS=0 dedicated, MI>0 flex → hasDedicatedSlot=true (flex counts in pos weight logic)
    expect(result.bidCap).toBe(24);
    expect(result.capSource).not.toContain("need ×0.7");
    expect(result.capSource).not.toContain("need ×0.5");
  });

  it("elite override: rawMaxBid >= $30 skips UTIL reduction", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 35,
        positions: ["OF"],
        remainingSlots: { OF: 0, UTIL: 1 },
      }),
    );
    // Elite ($35 >= $30) → no reduction, annotate elite override
    // 35 + 0 (pos +0 OF slots full) = 35
    expect(result.bidCap).toBe(35);
    expect(result.capSource).toContain("elite override");
    expect(result.capSource).not.toContain("need ×0.7");
  });

  it("pitcher BN dampening when P slots full", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 15,
        isPitcher: true,
        isSP: true,
        positions: ["SP"],
        spCount: 0,
        remainingSlots: { P: 0 },
      }),
    );
    // Pitcher, P=0 → BN. rawMaxBid 15 < 30 → ×0.5 = ceil(7.5) = 8
    // Then SP1 cap $18 (no effect since 8 < 18)
    expect(result.bidCap).toBe(8);
    expect(result.capSource).toContain("need ×0.5 (BN)");
  });

  it("no pitcher reduction when P slots available", () => {
    const result = computeStrategyBidCap(
      makeInput({
        rawMaxBid: 15,
        isPitcher: true,
        isSP: true,
        positions: ["SP"],
        spCount: 0,
        remainingSlots: { P: 3 },
      }),
    );
    // Pitcher, P>0 → dedicated. No need reduction.
    // SP1 cap: min(15, 18) = 15
    expect(result.bidCap).toBe(15);
    expect(result.capSource).not.toContain("need");
  });
});
