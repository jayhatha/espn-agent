import { describe, it, expect } from "vitest";
import {
  getSpTierCap,
  getPositionalWeight,
  CATEGORY_RANK_TARGETS,
  GS_CAP,
  POSITIONAL_WEIGHTS,
  SP_TIER_CAPS,
} from "../draft-constants";

// ============================================================
// getSpTierCap tests
// ============================================================

describe("getSpTierCap", () => {
  it("returns 18 for spCount=0 (SP1 tier)", () => {
    expect(getSpTierCap(0)).toBe(18);
  });

  it("returns 12 for spCount=1 (SP2 tier)", () => {
    expect(getSpTierCap(1)).toBe(12);
  });

  it("returns 10 for spCount=2 (SP3 tier)", () => {
    expect(getSpTierCap(2)).toBe(10);
  });

  it("returns 5 for spCount=3 (SP4 tier)", () => {
    expect(getSpTierCap(3)).toBe(5);
  });

  it("returns 3 for spCount=4 (SP5 tier)", () => {
    expect(getSpTierCap(4)).toBe(3);
  });

  it("clamps to last tier (3) for spCount=10", () => {
    expect(getSpTierCap(10)).toBe(3);
  });

  it("clamps to last tier (3) for very large spCount", () => {
    expect(getSpTierCap(99)).toBe(3);
  });

  it("SP_TIER_CAPS has 5 tiers", () => {
    expect(SP_TIER_CAPS).toHaveLength(5);
  });
});

// ============================================================
// getPositionalWeight tests
// ============================================================

describe("getPositionalWeight", () => {
  it("returns 4 for SS", () => {
    expect(getPositionalWeight(["SS"])).toBe(4);
  });

  it("returns 3 for OF", () => {
    expect(getPositionalWeight(["OF"])).toBe(3);
  });

  it("returns 3 for 3B", () => {
    expect(getPositionalWeight(["3B"])).toBe(3);
  });

  it("returns 2 for 1B", () => {
    expect(getPositionalWeight(["1B"])).toBe(2);
  });

  it("returns 2 for 2B", () => {
    expect(getPositionalWeight(["2B"])).toBe(2);
  });

  it("returns 1 for C", () => {
    expect(getPositionalWeight(["C"])).toBe(1);
  });

  it("returns 0 for SP", () => {
    expect(getPositionalWeight(["SP"])).toBe(0);
  });

  it("returns 0 for RP", () => {
    expect(getPositionalWeight(["RP"])).toBe(0);
  });

  it("returns 0 for UTIL slot", () => {
    expect(getPositionalWeight(["UTIL"])).toBe(0);
  });

  it("returns 2 for DH", () => {
    expect(getPositionalWeight(["DH"])).toBe(2);
  });

  // Multi-position: max weight
  it("returns 4 (max) for dual-eligible 2B/SS", () => {
    expect(getPositionalWeight(["2B", "SS"])).toBe(4);
  });

  it("returns 2 (max) for dual-eligible C/1B", () => {
    expect(getPositionalWeight(["C", "1B"])).toBe(2);
  });

  it("returns 3 (max) for dual-eligible OF/3B", () => {
    expect(getPositionalWeight(["OF", "3B"])).toBe(3);
  });

  it("returns 4 (max) for triple-eligible 1B/SS/OF", () => {
    expect(getPositionalWeight(["1B", "SS", "OF"])).toBe(4);
  });

  // Edge: empty positions
  it("returns 0 for empty positions array", () => {
    expect(getPositionalWeight([])).toBe(0);
  });

  // Case insensitive
  it("handles lowercase position names via toUpperCase()", () => {
    expect(getPositionalWeight(["ss"])).toBe(4);
    expect(getPositionalWeight(["of"])).toBe(3);
  });

  // Unknown position
  it("returns 0 for completely unknown position", () => {
    expect(getPositionalWeight(["XYZ"])).toBe(0);
  });

  it("POSITIONAL_WEIGHTS contains expected keys", () => {
    expect(POSITIONAL_WEIGHTS).toHaveProperty("SS", 4);
    expect(POSITIONAL_WEIGHTS).toHaveProperty("OF", 3);
    expect(POSITIONAL_WEIGHTS).toHaveProperty("SP", 0);
  });
});

// ============================================================
// CATEGORY_RANK_TARGETS tests
// ============================================================

describe("CATEGORY_RANK_TARGETS", () => {
  it("has OPS target of 3", () => {
    expect(CATEGORY_RANK_TARGETS["OPS"]).toBe(3);
  });

  it("has HR target of 3", () => {
    expect(CATEGORY_RANK_TARGETS["HR"]).toBe(3);
  });

  it("has K target of 5", () => {
    expect(CATEGORY_RANK_TARGETS["K"]).toBe(5);
  });

  it("has SB target of 4", () => {
    expect(CATEGORY_RANK_TARGETS["SB"]).toBe(4);
  });

  it("has SV target of 4", () => {
    expect(CATEGORY_RANK_TARGETS["SV"]).toBe(4);
  });

  it("has ERA target of 4", () => {
    expect(CATEGORY_RANK_TARGETS["ERA"]).toBe(4);
  });

  it("has WHIP target of 4", () => {
    expect(CATEGORY_RANK_TARGETS["WHIP"]).toBe(4);
  });

  it("covers at least 10 scoring categories", () => {
    expect(Object.keys(CATEGORY_RANK_TARGETS).length).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================
// GS_CAP constant
// ============================================================

describe("GS_CAP", () => {
  it("equals 200", () => {
    expect(GS_CAP).toBe(200);
  });
});
