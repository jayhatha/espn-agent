import { describe, it, expect } from "vitest";
import {
  mapStatNameToCategory,
  getDefault5x5Categories,
} from "../draft-config-detector";

describe("mapStatNameToCategory", () => {
  it("should include formula_id for AVG rate stat", () => {
    const category = mapStatNameToCategory("AVG");
    expect(category.formula_id).toBe("avg");
    expect(category.required_components).toContain("AB");
    expect(category.required_components).toContain("H");
  });

  it("should include formula_id for ERA rate stat", () => {
    const category = mapStatNameToCategory("ERA");
    expect(category.formula_id).toBe("era");
    expect(category.required_components).toContain("IP");
    expect(category.required_components).toContain("ER");
  });

  it("should include formula_id for WHIP rate stat", () => {
    const category = mapStatNameToCategory("WHIP");
    expect(category.formula_id).toBe("whip");
    expect(category.required_components).toContain("IP");
    expect(category.required_components).toContain("H");
    expect(category.required_components).toContain("BB");
  });

  it("should include formula_id for OBP rate stat", () => {
    const category = mapStatNameToCategory("OBP");
    expect(category.formula_id).toBe("obp");
    expect(category.required_components).toBeDefined();
    expect(category.required_components!.length).toBeGreaterThan(0);
  });

  it("should include formula_id for OPS rate stat", () => {
    const category = mapStatNameToCategory("OPS");
    expect(category.formula_id).toBe("ops");
    expect(category.required_components).toBeDefined();
    expect(category.required_components!.length).toBeGreaterThan(0);
  });

  it("should include formula_id for SLG rate stat", () => {
    const category = mapStatNameToCategory("SLG");
    expect(category.formula_id).toBe("slg");
    expect(category.required_components).toContain("AB");
    expect(category.required_components).toContain("TB");
  });

  it("should not include formula_id for counting stats", () => {
    const category = mapStatNameToCategory("HR");
    expect(category.formula_id).toBeUndefined();
  });

  it("should not include formula_id for R counting stat", () => {
    const category = mapStatNameToCategory("R");
    expect(category.formula_id).toBeUndefined();
    expect(category.type).toBe("COUNTING");
  });

  it("should not include formula_id for K counting stat", () => {
    const category = mapStatNameToCategory("K");
    expect(category.formula_id).toBeUndefined();
    expect(category.type).toBe("COUNTING");
  });

  it("should include formula_id for WPCT rate stat", () => {
    const category = mapStatNameToCategory("WPCT");
    expect(category.formula_id).toBe("wpct");
    expect(category.type).toBe("RATE");
    expect(category.direction).toBe("HIGHER_BETTER");
    expect(category.required_components).toContain("W");
    expect(category.required_components).toContain("L");
  });

  it("should use RATE type for AVG, ERA, WHIP, WPCT", () => {
    expect(mapStatNameToCategory("AVG").type).toBe("RATE");
    expect(mapStatNameToCategory("ERA").type).toBe("RATE");
    expect(mapStatNameToCategory("WHIP").type).toBe("RATE");
    expect(mapStatNameToCategory("WPCT").type).toBe("RATE");
  });

  it("should use COUNTING type for HR, RBI, SB, W, SV, K", () => {
    expect(mapStatNameToCategory("HR").type).toBe("COUNTING");
    expect(mapStatNameToCategory("RBI").type).toBe("COUNTING");
    expect(mapStatNameToCategory("SB").type).toBe("COUNTING");
    expect(mapStatNameToCategory("W").type).toBe("COUNTING");
    expect(mapStatNameToCategory("SV").type).toBe("COUNTING");
    expect(mapStatNameToCategory("K").type).toBe("COUNTING");
  });

  it("should use LOWER_BETTER direction for ERA and WHIP", () => {
    expect(mapStatNameToCategory("ERA").direction).toBe("LOWER_BETTER");
    expect(mapStatNameToCategory("WHIP").direction).toBe("LOWER_BETTER");
  });

  it("should return a default COUNTING category for unknown stats", () => {
    const category = mapStatNameToCategory("UNKNOWN_STAT");
    expect(category.stat_key).toBe("UNKNOWN_STAT");
    expect(category.type).toBe("COUNTING");
    expect(category.direction).toBe("HIGHER_BETTER");
    expect(category.formula_id).toBeUndefined();
  });
});

describe("getDefault5x5Categories", () => {
  it("should return standard 5x5 categories (10 total)", () => {
    const categories = getDefault5x5Categories();
    expect(categories.length).toBe(10);
  });

  it("should include formula_id for all RATE stats", () => {
    const categories = getDefault5x5Categories();
    const rateStats = categories.filter((c) => c.type === "RATE");

    expect(rateStats.length).toBeGreaterThan(0);

    for (const stat of rateStats) {
      expect(stat.formula_id).toBeDefined();
      expect(stat.required_components).toBeDefined();
      expect(stat.required_components!.length).toBeGreaterThan(0);
    }
  });

  it("should include AVG with correct formula_id", () => {
    const categories = getDefault5x5Categories();
    const avg = categories.find((c) => c.stat_key === "AVG");
    expect(avg).toBeDefined();
    expect(avg!.formula_id).toBe("avg");
    expect(avg!.required_components).toContain("AB");
    expect(avg!.required_components).toContain("H");
  });

  it("should include ERA with correct formula_id", () => {
    const categories = getDefault5x5Categories();
    const era = categories.find((c) => c.stat_key === "ERA");
    expect(era).toBeDefined();
    expect(era!.formula_id).toBe("era");
    expect(era!.required_components).toContain("IP");
    expect(era!.required_components).toContain("ER");
  });

  it("should include WHIP with correct formula_id", () => {
    const categories = getDefault5x5Categories();
    const whip = categories.find((c) => c.stat_key === "WHIP");
    expect(whip).toBeDefined();
    expect(whip!.formula_id).toBe("whip");
    expect(whip!.required_components).toContain("IP");
    expect(whip!.required_components).toContain("H");
    expect(whip!.required_components).toContain("BB");
  });

  it("should include standard batting counting stats: R, HR, RBI, SB", () => {
    const categories = getDefault5x5Categories();
    const statKeys = categories.map((c) => c.stat_key);
    expect(statKeys).toContain("R");
    expect(statKeys).toContain("HR");
    expect(statKeys).toContain("RBI");
    expect(statKeys).toContain("SB");
  });

  it("should include standard pitching counting stats: W, SV, K", () => {
    const categories = getDefault5x5Categories();
    const statKeys = categories.map((c) => c.stat_key);
    expect(statKeys).toContain("W");
    expect(statKeys).toContain("SV");
    expect(statKeys).toContain("K");
  });

  it("should not include formula_id for counting stats", () => {
    const categories = getDefault5x5Categories();
    const countingStats = categories.filter((c) => c.type === "COUNTING");

    for (const stat of countingStats) {
      expect(stat.formula_id).toBeUndefined();
    }
  });
});
