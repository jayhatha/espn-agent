import { describe, it, expect } from "vitest";
import {
  computeStrategyBidCap,
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

  it("does not apply SP tier cap to RP", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, isPitcher: true, isSP: false, positions: ["RP"] }),
    );
    // RP: no positional weight, no SP cap → rawMaxBid unchanged
    expect(result.bidCap).toBe(30);
  });
});

describe("computeStrategyBidCap — hitter budget cap", () => {
  it("caps bid when hitterSpent + bid would exceed $200", () => {
    const result = computeStrategyBidCap(
      makeInput({ rawMaxBid: 30, hitterSpent: 185, positions: ["OF"] }),
    );
    // Headroom: 200 - 185 = 15. rawMaxBid 30 + pos 3 = 33, capped to 15.
    expect(result.bidCap).toBe(15);
    expect(result.capSource).toContain("hitter cap $200");
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
      }),
    );
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
        hitterSpent: 190,
      }),
    );
    // 40 × 0.5 = 20 (C filled dampening)
    // 20 + 1 (C weight) = 21
    // Hitter cap: 190 + 21 = 211 > 200, headroom = 10 → cap to 10
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
      }),
    );
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
