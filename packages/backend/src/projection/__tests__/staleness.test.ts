import { describe, it, expect } from "vitest";
import { computeProrateFactor } from "../staleness.js";

describe("computeProrateFactor", () => {
  it("returns 1.0 when asOfDate equals today (same-day upload)", () => {
    const factor = computeProrateFactor(
      "2026-04-01",
      "2026-04-01",
      "2026-09-28",
    );
    expect(factor).toBeCloseTo(1.0, 5);
  });

  it("returns approx 0.5 when half the season has elapsed", () => {
    // asOfDate = 2026-04-01, today = 2026-07-01 ~ halfway through the season
    const factor = computeProrateFactor(
      "2026-04-01",
      "2026-07-01",
      "2026-09-28",
    );
    // remaining from today ~= 89 days, remaining from asOf ~= 180 days => ~0.49
    expect(factor).toBeGreaterThan(0.4);
    expect(factor).toBeLessThan(0.6);
  });

  it("returns 0.0 when today is past season end", () => {
    const factor = computeProrateFactor(
      "2026-04-01",
      "2026-09-30",
      "2026-09-28",
    );
    expect(factor).toBe(0.0);
  });

  it("returns 1.0 when today is before asOfDate (future asOfDate)", () => {
    const factor = computeProrateFactor(
      "2026-04-01",
      "2026-03-15",
      "2026-09-28",
    );
    expect(factor).toBe(1.0);
  });

  it("returns approx remainingFromToday/remainingFromAsOf for a mid-season date", () => {
    // asOfDate = 2026-04-01, today = 2026-06-28
    const asOf = new Date("2026-04-01");
    const now = new Date("2026-06-28");
    const end = new Date("2026-09-28");
    const remainingFromAsOf =
      (end.getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24);
    const remainingFromToday =
      (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    const expected = remainingFromToday / remainingFromAsOf;

    const factor = computeProrateFactor(
      "2026-04-01",
      "2026-06-28",
      "2026-09-28",
    );
    expect(factor).toBeCloseTo(expected, 5);
  });

  it("returns 0.0 when asOfDate is exactly season end", () => {
    const factor = computeProrateFactor(
      "2026-09-28",
      "2026-09-28",
      "2026-09-28",
    );
    expect(factor).toBe(0);
  });

  it("derives the default season end from today's year", () => {
    // Should not throw; same result as explicit
    const explicit = computeProrateFactor(
      "2026-04-01",
      "2026-04-01",
      "2026-10-01",
    );
    const implicit = computeProrateFactor("2026-04-01", "2026-04-01");
    expect(implicit).toBeCloseTo(explicit, 5);
  });
});
