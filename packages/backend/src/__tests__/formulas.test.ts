import { describe, it, expect } from "vitest";
import {
  calculateAVG,
  calculateOBP,
  calculateSLG,
  calculateOPS,
  calculateERA,
  calculateWHIP,
  calculateK9,
  calculateWPCT,
  combineComponents,
  calculateFinalRate,
  calculateCategorySGP,
} from "../../../shared/dist/formulas.js";

// ─── calculateAVG ──────────────────────────────────────────────────────────

describe("calculateAVG", () => {
  it("computes H/AB correctly", () => {
    // Arrange
    const components = { AB: 500, H: 150 };
    // Act
    const result = calculateAVG(components);
    // Assert
    expect(result).toBeCloseTo(0.3);
  });

  it("returns 0 when AB is 0", () => {
    expect(calculateAVG({ AB: 0, H: 10 })).toBe(0);
  });

  it("returns 0 when all components missing", () => {
    expect(calculateAVG({})).toBe(0);
  });
});

// ─── calculateOBP ──────────────────────────────────────────────────────────

describe("calculateOBP", () => {
  it("computes (H+BB+HBP)/(AB+BB+HBP+SF) correctly", () => {
    // Arrange: .300 hitter with 70 BB, 10 HBP, 5 SF over 500 AB, 150 H
    const components = { AB: 500, H: 150, BB: 70, HBP: 10, SF: 5 };
    // Act
    const result = calculateOBP(components);
    // Assert: (150+70+10)/(500+70+10+5) = 230/585
    expect(result).toBeCloseTo(230 / 585);
  });

  it("returns 0 when denominator is 0", () => {
    expect(calculateOBP({})).toBe(0);
  });

  it("handles missing optional components (HBP, SF default to 0)", () => {
    const result = calculateOBP({ AB: 400, H: 120, BB: 40 });
    // (120+40)/(400+40) = 160/440
    expect(result).toBeCloseTo(160 / 440);
  });
});

// ─── calculateSLG ──────────────────────────────────────────────────────────

describe("calculateSLG", () => {
  it("computes TB/AB correctly", () => {
    // Arrange: 200 TB over 500 AB = .400 SLG
    const components = { AB: 500, TB: 200 };
    expect(calculateSLG(components)).toBeCloseTo(0.4);
  });

  it("returns 0 when AB is 0", () => {
    expect(calculateSLG({ AB: 0, TB: 100 })).toBe(0);
  });
});

// ─── calculateOPS ──────────────────────────────────────────────────────────

describe("calculateOPS", () => {
  it("equals OBP + SLG", () => {
    const components = { AB: 500, H: 150, BB: 60, HBP: 5, SF: 3, TB: 240 };
    const obp = calculateOBP(components);
    const slg = calculateSLG(components);
    expect(calculateOPS(components)).toBeCloseTo(obp + slg);
  });

  it("returns 0 for empty components", () => {
    expect(calculateOPS({})).toBe(0);
  });
});

// ─── calculateERA ──────────────────────────────────────────────────────────

describe("calculateERA", () => {
  it("computes 9*ER/IP correctly", () => {
    // Arrange: 27 ER over 180 IP = 1.35 ERA
    const components = { IP: 180, ER: 27 };
    expect(calculateERA(components)).toBeCloseTo(1.35);
  });

  it("returns 0 when IP is 0", () => {
    expect(calculateERA({ IP: 0, ER: 10 })).toBe(0);
  });

  it("returns 0 for empty components", () => {
    expect(calculateERA({})).toBe(0);
  });
});

// ─── calculateWHIP ─────────────────────────────────────────────────────────

describe("calculateWHIP", () => {
  it("uses HA and BBA when present (pitcher-specific keys)", () => {
    // Arrange: 150 HA, 50 BBA over 180 IP = 200/180 = 1.111 WHIP
    const components = { IP: 180, HA: 150, BBA: 50 };
    expect(calculateWHIP(components)).toBeCloseTo(200 / 180);
  });

  it("falls back to H and BB when HA/BBA absent", () => {
    const components = { IP: 100, H: 90, BB: 30 };
    expect(calculateWHIP(components)).toBeCloseTo(120 / 100);
  });

  it("returns 0 when IP is 0", () => {
    expect(calculateWHIP({ IP: 0, HA: 10, BBA: 5 })).toBe(0);
  });
});

// ─── calculateK9 ───────────────────────────────────────────────────────────

describe("calculateK9", () => {
  it("computes 9*K/IP correctly", () => {
    // Arrange: 225 K over 200 IP = 10.125 K/9
    const components = { IP: 200, K: 225 };
    expect(calculateK9(components)).toBeCloseTo(10.125);
  });

  it("returns 0 when IP is 0", () => {
    expect(calculateK9({ IP: 0, K: 50 })).toBe(0);
  });
});

// ─── calculateWPCT ─────────────────────────────────────────────────────────

describe("calculateWPCT", () => {
  it("computes W/(W+L) correctly", () => {
    expect(calculateWPCT({ W: 15, L: 10 })).toBeCloseTo(15 / 25);
  });

  it("returns 0 when no decisions", () => {
    expect(calculateWPCT({ W: 0, L: 0 })).toBe(0);
  });

  it("returns 1.0 with all wins", () => {
    expect(calculateWPCT({ W: 10, L: 0 })).toBeCloseTo(1.0);
  });
});

// ─── combineComponents ─────────────────────────────────────────────────────

describe("combineComponents", () => {
  it("adds matching keys from both objects", () => {
    const current = { AB: 300, H: 90, BB: 30 };
    const projected = { AB: 200, H: 60, BB: 20 };
    const result = combineComponents(current, projected);
    expect(result.AB).toBe(500);
    expect(result.H).toBe(150);
    expect(result.BB).toBe(50);
  });

  it("includes keys present only in current", () => {
    const current = { AB: 300, H: 90 };
    const projected = { BB: 40 };
    const result = combineComponents(current, projected);
    expect(result.AB).toBe(300);
    expect(result.H).toBe(90);
    expect(result.BB).toBe(40);
  });

  it("treats missing keys as 0", () => {
    const result = combineComponents({ AB: 100 }, { H: 30 });
    expect(result.AB).toBe(100);
    expect(result.H).toBe(30);
  });

  it("handles empty objects", () => {
    expect(combineComponents({}, {})).toEqual({});
  });
});

// ─── calculateFinalRate ────────────────────────────────────────────────────

describe("calculateFinalRate", () => {
  it("combines components before calculating rate (not average of rates)", () => {
    // YTD: 300 AB, 90 H → .300 avg
    // Projected: 200 AB, 50 H → .250 avg
    // Combined: 500 AB, 140 H → .280 (not (.300+.250)/2 = .275)
    const current = { AB: 300, H: 90 };
    const projected = { AB: 200, H: 50 };
    const result = calculateFinalRate("avg", current, projected);
    expect(result).toBeCloseTo(140 / 500);
    // Guard that it's NOT a naive rate average
    expect(result).not.toBeCloseTo((0.3 + 0.25) / 2);
  });

  it("dispatches all recognized formulaIds without throwing", () => {
    const comps = {
      AB: 500,
      H: 150,
      BB: 60,
      HBP: 5,
      SF: 3,
      TB: 240,
      IP: 150,
      ER: 50,
      HA: 130,
      BBA: 50,
      K: 175,
      W: 12,
      L: 8,
    };
    const formulas = ["avg", "obp", "slg", "ops", "era", "whip", "k9", "wpct"];
    for (const f of formulas) {
      expect(() => calculateFinalRate(f, comps, {})).not.toThrow();
    }
  });

  it("throws on unknown formulaId", () => {
    expect(() => calculateFinalRate("xfip", {}, {})).toThrowError(
      /Unknown formula/,
    );
  });
});

// ─── calculateCategorySGP ──────────────────────────────────────────────────

describe("calculateCategorySGP", () => {
  it("returns 0 for empty player pool", () => {
    expect(calculateCategorySGP(50, [])).toBe(0);
  });

  it("returns 0 when all players have same value (stdDev = 0)", () => {
    expect(calculateCategorySGP(30, [30, 30, 30, 30])).toBe(0);
  });

  it("returns positive SGP for above-average value", () => {
    // Mean = 30, stdDev computed from [10, 20, 30, 40, 50]
    const allValues = [10, 20, 30, 40, 50];
    const sgp = calculateCategorySGP(40, allValues);
    expect(sgp).toBeGreaterThan(0);
  });

  it("returns negative SGP for below-average value", () => {
    const allValues = [10, 20, 30, 40, 50];
    const sgp = calculateCategorySGP(10, allValues);
    expect(sgp).toBeLessThan(0);
  });

  it("returns 0 SGP for mean value", () => {
    const allValues = [10, 20, 30, 40, 50];
    expect(calculateCategorySGP(30, allValues)).toBeCloseTo(0);
  });
});
