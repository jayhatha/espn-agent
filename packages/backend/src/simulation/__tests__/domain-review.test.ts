import { describe, expect, it } from "vitest";
import { samplePlayerComponents } from "../opportunity.js";
import { createRng } from "../prng.js";
import { simulateTeamRun } from "../daily-simulator.js";
import { runMonteCarlo } from "../monte-carlo.js";
import type { TeamOpportunityStream } from "../types.js";

function hitterStream(
  benchPositions: string[],
  benchAB: number,
): TeamOpportunityStream {
  return {
    teamId: 1,
    daysRemaining: 100,
    gsCapRemaining: Number.POSITIVE_INFINITY,
    hitters: [
      {
        playerId: 1,
        positions: ["OF"],
        rosComponents: { AB: 100, H: 25, HR: 10, TB: 60, R: 20, RBI: 20 },
        activeSlot: "OF",
        isActive: true,
        isSP: false,
        availabilityRate: 0.5,
      },
    ],
    pitchers: [],
    bench: [
      {
        playerId: 2,
        positions: benchPositions,
        rosComponents: {
          AB: benchAB,
          H: benchAB * 0.25,
          HR: benchAB * 0.05,
          TB: benchAB * 0.4,
        },
        activeSlot: "BN",
        isActive: false,
        isSP: false,
        availabilityRate: 1,
      },
    ],
  };
}

describe("coherent simulation sampling", () => {
  it("preserves baseball event invariants", () => {
    const rng = createRng(42);
    const projection = {
      AB: 500,
      H: 140,
      "2B": 30,
      "3B": 4,
      HR: 25,
      TB: 253,
      BB: 50,
      R: 80,
      RBI: 85,
    };

    for (let i = 0; i < 100; i++) {
      const sampled = samplePlayerComponents(projection, rng);
      expect(sampled.HR).toBeLessThanOrEqual(sampled.H ?? 0);
      expect(sampled.TB).toBeGreaterThanOrEqual(sampled.H ?? 0);
      expect(
        (sampled["1B"] ?? 0) +
          (sampled["2B"] ?? 0) +
          (sampled["3B"] ?? 0) +
          (sampled.HR ?? 0),
      ).toBeCloseTo(sampled.H ?? 0, 8);
    }
  });
});

describe("opportunity-based churn coverage", () => {
  it("caps eligible bench coverage by projected volume", () => {
    const result = simulateTeamRun(
      hitterStream(["OF"], 20),
      {},
      {},
      0,
      null,
      null,
    );
    expect(result.batterComponents.AB).toBeCloseTo(100, 8);
    expect(result.sourceDays.bench).toBeCloseTo(20 / 3.5, 8);
    expect(result.sourceDays.replacement).toBeCloseTo(30 / 3.5, 8);
  });

  it("does not use position-ineligible bench coverage", () => {
    const result = simulateTeamRun(
      hitterStream(["C"], 50),
      {},
      {},
      0,
      null,
      null,
    );
    expect(result.sourceDays.bench).toBe(0);
    expect(result.sourceDays.replacement).toBeCloseTo(50 / 3.5, 8);
  });

  it("applies bench availability to both production and coverage volume", () => {
    const stream = hitterStream(["OF"], 40);
    stream.bench[0].availabilityRate = 0.25;
    const result = simulateTeamRun(stream, {}, {}, 0, null, null);

    expect(result.sourceDays.bench).toBeCloseTo(10 / 3.5, 8);
    expect(result.sourceDays.replacement).toBeCloseTo(40 / 3.5, 8);
    expect(result.batterComponents.AB).toBeCloseTo(100, 8);
  });

  it("gives an unavailable bench player zero coverage and production", () => {
    const stream = hitterStream(["OF"], 50);
    stream.bench[0].availabilityRate = 0;
    const result = simulateTeamRun(stream, {}, {}, 0, null, null);

    expect(result.sourceDays.bench).toBe(0);
    expect(result.sourceDays.replacement).toBeCloseTo(50 / 3.5, 8);
    expect(result.batterComponents.AB).toBeCloseTo(100, 8);
  });
});

function pitcherStream(withBenchStarter: boolean): TeamOpportunityStream {
  return {
    teamId: 1,
    daysRemaining: 100,
    gsCapRemaining: 10,
    hitters: [],
    pitchers: [
      {
        playerId: 10,
        positions: ["SP"],
        rosComponents: { IP: 100, K: 100, ER: 40, GS: 20 },
        activeSlot: "SP",
        isActive: true,
        isSP: true,
        availabilityRate: 0.5,
      },
      {
        playerId: 11,
        positions: ["RP"],
        rosComponents: { IP: 20, K: 20, ER: 5, GS: 0 },
        activeSlot: "RP",
        isActive: true,
        isSP: false,
        availabilityRate: 1,
      },
    ],
    bench: withBenchStarter
      ? [
          {
            playerId: 12,
            positions: ["SP"],
            rosComponents: { IP: 50, K: 50, ER: 20, GS: 10 },
            activeSlot: "BN",
            isActive: false,
            isSP: true,
            availabilityRate: 1,
          },
        ]
      : [],
  };
}

describe("starter opportunity GS cap", () => {
  it("zeros active and bench starter production when cap is exhausted", () => {
    const result = simulateTeamRun(pitcherStream(true), {}, {}, 200, 200, null);

    expect(result.pitcherComponents.IP).toBeCloseTo(20, 8);
    expect(result.pitcherComponents.K).toBeCloseTo(20, 8);
  });

  it("caps active and replacement starter production together while preserving relievers", () => {
    const result = simulateTeamRun(
      pitcherStream(false),
      {},
      {},
      190,
      200,
      null,
    );

    expect(result.pitcherComponents.IP).toBeCloseTo(70, 8);
    expect(result.pitcherComponents.K).toBeCloseTo(66.25, 8);
  });
});

describe("scoring format gate", () => {
  it("rejects non-roto simulation state", () => {
    expect(() =>
      runMonteCarlo({ isViable: true, scoringFormat: "points" } as any),
    ).toThrow("requires a viable roto league state");
  });
});
