import { describe, it, expect } from "vitest";
import { applyGsCap, scaleComponents } from "../pitcher-scaling.js";

describe("scaleComponents", () => {
  it("scales all numeric fields by factor", () => {
    const result = scaleComponents({ IP: 100, K: 80, ER: 30 }, 0.5);
    expect(result.IP).toBeCloseTo(50);
    expect(result.K).toBeCloseTo(40);
    expect(result.ER).toBeCloseTo(15);
  });

  it("returns 0 for all fields when factor=0", () => {
    const result = scaleComponents({ IP: 100, K: 200, W: 15 }, 0);
    expect(result.IP).toBe(0);
    expect(result.K).toBe(0);
    expect(result.W).toBe(0);
  });

  it("returns same values when factor=1.0", () => {
    const result = scaleComponents({ IP: 180, K: 200, ER: 60, W: 15 }, 1.0);
    expect(result.IP).toBeCloseTo(180);
    expect(result.K).toBeCloseTo(200);
    expect(result.ER).toBeCloseTo(60);
    expect(result.W).toBeCloseTo(15);
  });

  it("ignores undefined fields (does not produce NaN)", () => {
    const result = scaleComponents({ IP: 100, K: undefined }, 0.5);
    expect(result.IP).toBeCloseTo(50);
    expect(result.K).toBeUndefined();
  });
});

describe("applyGsCap", () => {
  it("does not scale starts when the league explicitly has no cap", () => {
    const sps = [
      { playerId: 1, components: { IP: 180, K: 200, GS: 32 }, projectedGS: 32 },
    ];
    const result = applyGsCap(500, null, sps);
    expect(result.scaleFactor).toBe(1);
    expect(result.scaledProjections[0].scaledComponents.IP).toBe(180);
  });

  it("returns empty array with scaleFactor=1.0 for empty SP array", () => {
    const { scaledProjections, scaleFactor } = applyGsCap(0, 200, []);
    expect(scaledProjections).toEqual([]);
    expect(scaleFactor).toBe(1.0);
  });

  it("returns scaleFactor=1.0 when projected GS within remaining budget", () => {
    // 8 SPs projecting 25 GS each = 200 total; gsUsed=0; gsCap=200; remaining=200
    const sps = Array.from({ length: 8 }, (_, i) => ({
      playerId: i + 1,
      components: { IP: 150, K: 120, ER: 50, W: 10, GS: 25 },
      projectedGS: 25,
    }));
    const { scaleFactor } = applyGsCap(0, 200, sps);
    expect(scaleFactor).toBe(1.0);
  });

  it("scales SP components by 0.5 when gsUsed=100 and projected GS=200 (remaining=100)", () => {
    // gsRemaining = 200 - 100 = 100; totalProjectedGS = 200; scaleFactor = 100/200 = 0.5
    const sps = Array.from({ length: 8 }, (_, i) => ({
      playerId: i + 1,
      components: { IP: 150, K: 120, ER: 50, W: 10 },
      projectedGS: 25,
    }));
    const { scaledProjections, scaleFactor } = applyGsCap(100, 200, sps);
    expect(scaleFactor).toBeCloseTo(0.5);
    // Check each SP component is halved
    for (const sp of scaledProjections) {
      expect(sp.scaledComponents.IP).toBeCloseTo(75);
      expect(sp.scaledComponents.K).toBeCloseTo(60);
      expect(sp.scaledComponents.ER).toBeCloseTo(25);
      expect(sp.scaledComponents.W).toBeCloseTo(5);
    }
  });

  it("zeros SP components when gsUsed >= gsCap (cap exhausted)", () => {
    // gsUsed=200, gsCap=200: gsRemaining=0, scaleFactor=0
    const sps = [
      {
        playerId: 1,
        components: { IP: 150, K: 120, ER: 50, W: 10 },
        projectedGS: 25,
      },
    ];
    const { scaledProjections, scaleFactor } = applyGsCap(200, 200, sps);
    expect(scaleFactor).toBe(0);
    expect(scaledProjections[0].scaledComponents.IP).toBe(0);
    expect(scaledProjections[0].scaledComponents.K).toBe(0);
  });

  it("zeros SP components when gsUsed exceeds gsCap (over cap)", () => {
    // gsUsed=210, gsCap=200: gsRemaining=0, scaleFactor=0
    const sps = [
      { playerId: 1, components: { IP: 150, K: 120 }, projectedGS: 20 },
    ];
    const { scaledProjections, scaleFactor } = applyGsCap(210, 200, sps);
    expect(scaleFactor).toBe(0);
    expect(scaledProjections[0].scaledComponents.IP).toBe(0);
  });

  it("RP projections are never scaled (not passed to applyGsCap)", () => {
    // RP projections should not be passed to applyGsCap — this tests that
    // the function only operates on what's passed. RP callers should not call applyGsCap.
    // We verify by passing a fake "RP" array — the function treats them like SPs
    // but this test documents that the CALLER is responsible for filtering SPs only.
    // The function should return same scaleFactor for any input that is within budget.
    const rps = [
      {
        playerId: 99,
        components: { IP: 60, K: 70, SV: 30, W: 5 },
        projectedGS: 0,
      },
    ];
    // RP with projectedGS=0: totalProjectedGS=0 <= gsRemaining=200 → scaleFactor=1.0
    const { scaleFactor } = applyGsCap(0, 200, rps);
    expect(scaleFactor).toBe(1.0);
  });

  it("uses GS fallback from IP when projectedGS is null and IP > 80", () => {
    // IP=120 → estimateGS = round(120/6) = 20; gsUsed=190; gsCap=200; remaining=10
    // totalProjectedGS = 20; scaleFactor = 10/20 = 0.5
    const sps = [
      {
        playerId: 1,
        components: { IP: 120, K: 100, ER: 40, W: 10 },
        projectedGS: null,
      },
    ];
    const { scaleFactor } = applyGsCap(190, 200, sps);
    expect(scaleFactor).toBeCloseTo(0.5);
  });

  it("uses GS fallback when ingest supplies zero for a starter", () => {
    const sps = [
      {
        playerId: 1,
        components: { IP: 120, K: 100, GS: 0 },
        projectedGS: 0,
        positions: ["SP"],
      },
    ];
    const { scaleFactor, scaledProjections } = applyGsCap(190, 200, sps);

    expect(scaleFactor).toBeCloseTo(0.5);
    expect(scaledProjections[0].scaledComponents.IP).toBeCloseTo(60);
  });

  it("does not scale an explicit reliever even with high IP and zero GS", () => {
    const rps = [
      {
        playerId: 1,
        components: { IP: 100, K: 120, SV: 30, GS: 0 },
        projectedGS: 0,
        positions: ["RP"],
      },
    ];
    const { scaleFactor, scaledProjections } = applyGsCap(200, 200, rps);

    expect(scaleFactor).toBe(1);
    expect(scaledProjections[0].scaledComponents).toEqual(rps[0].components);
  });

  it("treats projectedGS as 0 when IP <= 80 (reliever-level IP)", () => {
    // IP=50 → estimateGS=0 (below threshold); projectedGS=null
    // totalProjectedGS=0 <= gsRemaining=100 → scaleFactor=1.0
    const sps = [
      { playerId: 1, components: { IP: 50, K: 60, SV: 20 }, projectedGS: null },
    ];
    const { scaleFactor } = applyGsCap(100, 200, sps);
    expect(scaleFactor).toBe(1.0);
  });

  it("returns all playerId entries in scaledProjections matching input order", () => {
    const sps = [
      {
        playerId: 10,
        components: { IP: 180, K: 200, ER: 60 },
        projectedGS: 32,
      },
      {
        playerId: 20,
        components: { IP: 150, K: 160, ER: 50 },
        projectedGS: 28,
      },
    ];
    const { scaledProjections } = applyGsCap(0, 200, sps);
    expect(scaledProjections.map((sp) => sp.playerId)).toEqual([10, 20]);
  });
});
