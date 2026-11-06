import { describe, expect, it } from "vitest";
import { averageRosterBoundaryProduction } from "../transaction-impact.js";

describe("averageRosterBoundaryProduction", () => {
  it("averages the lowest-producing rostered players", () => {
    const result = averageRosterBoundaryProduction([
      { components: { AB: 500, HR: 30 }, score: 120 },
      { components: { AB: 300, HR: 12 }, score: 60 },
      { components: { AB: 200, HR: 8 }, score: 40 },
      { components: { AB: 100, HR: 4 }, score: 20 },
    ]);

    expect(result).toEqual({ AB: 200, HR: 8 });
  });

  it("uses all rostered players when fewer than the boundary sample exist", () => {
    const result = averageRosterBoundaryProduction([
      { components: { IP: 50, K: 45 }, score: 50 },
      { components: { IP: 70, K: 75 }, score: 80 },
    ]);

    expect(result).toEqual({ IP: 60, K: 60 });
  });

  it("ignores non-finite components", () => {
    const result = averageRosterBoundaryProduction([
      { components: { AB: 100, HR: Number.NaN }, score: 10 },
    ]);

    expect(result).toEqual({ AB: 100 });
  });
});
