/**
 * draft-board-engine.test.ts
 *
 * TDD tests for computeIdealRemainingSpend, surplusRatio, and surplusMultiplier.
 * All 8 scenarios from the plan spec.
 */

import { describe, it, expect } from "vitest";
import {
  computeIdealRemainingSpend,
  computeDraftBoardState,
  type BoardPlayer,
} from "../draft-board-engine";

// ============================================================
// Helpers
// ============================================================

function makePlayer(
  name: string,
  positions: string[],
  fgDollars: number,
  tier: "target" | "reach" = "target",
): BoardPlayer {
  return {
    name,
    normalizedName: name.toLowerCase().replace(/\s+/g, " ").trim(),
    tier,
    positions,
    fgDollars,
    espnAsv: fgDollars,
  };
}

// ============================================================
// computeIdealRemainingSpend tests
// ============================================================

describe("computeIdealRemainingSpend", () => {
  it("Case 1: empty roster, sums best FG$ at each filled position slot", () => {
    const positionsNeeded = ["C", "SS", "OF"];
    const positionLimits: Record<string, number> = { C: 1, SS: 1, OF: 1 };
    const draftedPlayers: BoardPlayer[] = [];
    const availablePlayers = [
      makePlayer("Catcher A", ["C"], 20),
      makePlayer("SS A", ["SS"], 30),
      makePlayer("OF A", ["OF"], 25),
    ];

    const result = computeIdealRemainingSpend(
      positionsNeeded,
      positionLimits,
      draftedPlayers,
      availablePlayers,
    );

    expect(result).toBe(75); // 20 + 30 + 25
  });

  it("Case 2: OF needs 4 slots — sums top 4 OF values", () => {
    const positionsNeeded = ["OF"];
    const positionLimits: Record<string, number> = { OF: 4 };
    const draftedPlayers: BoardPlayer[] = [];
    const availablePlayers = [
      makePlayer("OF A", ["OF"], 30),
      makePlayer("OF B", ["OF"], 25),
      makePlayer("OF C", ["OF"], 20),
      makePlayer("OF D", ["OF"], 15),
      makePlayer("OF E", ["OF"], 10),
    ];

    const result = computeIdealRemainingSpend(
      positionsNeeded,
      positionLimits,
      draftedPlayers,
      availablePlayers,
    );

    expect(result).toBe(90); // 30 + 25 + 20 + 15 (top 4, not top 1)
  });

  it("Case 3: multi-eligible player (SS/2B) counted once via specificity order", () => {
    // SS is processed before 2B in specificity order, so SS claims the dual-eligible player
    const positionsNeeded = ["SS", "2B"];
    const positionLimits: Record<string, number> = { SS: 1, "2B": 1 };
    const draftedPlayers: BoardPlayer[] = [];
    const availablePlayers = [
      makePlayer("Dual Eligible", ["SS", "2B"], 25), // eligible at both SS and 2B
      makePlayer("2B Only", ["2B"], 15),              // only 2B
    ];

    const result = computeIdealRemainingSpend(
      positionsNeeded,
      positionLimits,
      draftedPlayers,
      availablePlayers,
    );

    // SS claims dual-eligible (25), then 2B claims 2B-only (15)
    expect(result).toBe(40); // NOT 25+25=50
  });

  it("Case 4: no board players for a needed position — C ignored", () => {
    const positionsNeeded = ["C", "SS"];
    const positionLimits: Record<string, number> = { C: 1, SS: 1 };
    const draftedPlayers: BoardPlayer[] = [];
    const availablePlayers = [
      makePlayer("SS A", ["SS"], 30),
      // No catcher available
    ];

    const result = computeIdealRemainingSpend(
      positionsNeeded,
      positionLimits,
      draftedPlayers,
      availablePlayers,
    );

    expect(result).toBe(30); // Only SS contributes; C is absent from board
  });

  it("Case 5: idealRemainingSpend = 0 when no board players left", () => {
    const positionsNeeded = ["C"];
    const positionLimits: Record<string, number> = { C: 1 };
    const draftedPlayers: BoardPlayer[] = [];
    const availablePlayers: BoardPlayer[] = []; // empty board

    const result = computeIdealRemainingSpend(
      positionsNeeded,
      positionLimits,
      draftedPlayers,
      availablePlayers,
    );

    expect(result).toBe(0);
  });

  it("Case 6: large surplus is capped at 0.5 ratio", () => {
    // budget=$200, idealRemainingSpend=$100 → surplusRatio=1.0 → capped at 0.5
    // surplusMultiplier = 1 + 0.5 = 1.5
    const positionsNeeded = ["C"];
    const positionLimits: Record<string, number> = { C: 1 };
    const draftedPlayers: BoardPlayer[] = [];
    const availablePlayers = [makePlayer("Catcher A", ["C"], 100)];

    const idealSpend = computeIdealRemainingSpend(
      positionsNeeded,
      positionLimits,
      draftedPlayers,
      availablePlayers,
    );

    expect(idealSpend).toBe(100);

    const budget = 200;
    const surplusRatio = idealSpend > 0
      ? Math.max(0, (budget - idealSpend) / idealSpend)
      : 0;
    const surplusMultiplier = 1 + Math.min(0.5, surplusRatio);

    expect(surplusRatio).toBe(1.0);
    expect(surplusMultiplier).toBe(1.5); // capped at 1.5
  });

  it("Case 7: deficit — surplusRatio clamped to 0", () => {
    // budget=$100, idealRemainingSpend=$150
    const positionsNeeded = ["C"];
    const positionLimits: Record<string, number> = { C: 1 };
    const draftedPlayers: BoardPlayer[] = [];
    const availablePlayers = [makePlayer("Catcher A", ["C"], 150)];

    const idealSpend = computeIdealRemainingSpend(
      positionsNeeded,
      positionLimits,
      draftedPlayers,
      availablePlayers,
    );

    expect(idealSpend).toBe(150);

    const budget = 100;
    const surplusRatio = idealSpend > 0
      ? Math.max(0, (budget - idealSpend) / idealSpend)
      : 0;
    const surplusMultiplier = 1 + Math.min(0.5, surplusRatio);

    expect(surplusRatio).toBe(0); // clamped, not negative
    expect(surplusMultiplier).toBe(1.0);
  });
});

// ============================================================
// DraftBoardState surplus fields via computeDraftBoardState
// ============================================================

describe("DraftBoardState surplus fields (Case 8)", () => {
  it("includes idealRemainingSpend, surplusRatio, surplusMultiplier in return", () => {
    const allBoardPlayers = [
      makePlayer("Player A", ["C"], 20),
      makePlayer("Player B", ["OF"], 30),
      makePlayer("Player C", ["OF"], 25),
      makePlayer("Player D", ["OF"], 20),
      makePlayer("Player E", ["OF"], 15),
    ];

    const state = computeDraftBoardState(
      allBoardPlayers,
      [], // empty roster
      260, // full budget
    );

    expect(typeof state.idealRemainingSpend).toBe("number");
    expect(typeof state.surplusRatio).toBe("number");
    expect(typeof state.surplusMultiplier).toBe("number");

    // Sanity checks
    expect(state.idealRemainingSpend).toBeGreaterThanOrEqual(0);
    expect(state.surplusRatio).toBeGreaterThanOrEqual(0);
    expect(state.surplusMultiplier).toBeGreaterThanOrEqual(1.0);
    expect(state.surplusMultiplier).toBeLessThanOrEqual(1.5);
  });

  it("surplusMultiplier is 1.0 when no board players available", () => {
    const state = computeDraftBoardState(
      [], // no board players
      [],
      260,
    );

    expect(state.idealRemainingSpend).toBe(0);
    expect(state.surplusRatio).toBe(0);
    expect(state.surplusMultiplier).toBe(1.0);
  });

  it("surplusMultiplier increases when budget exceeds idealRemainingSpend", () => {
    // Budget $260, only need $50 of ideal spend => big surplus => capped at 1.5
    const allBoardPlayers = [
      makePlayer("Player A", ["C"], 50),
    ];

    const state = computeDraftBoardState(
      allBoardPlayers,
      [],
      260, // full budget remaining
    );

    expect(state.idealRemainingSpend).toBeGreaterThan(0);
    // (260 - idealSpend) / idealSpend is likely > 0.5, so multiplier = 1.5
    expect(state.surplusMultiplier).toBe(1.5);
  });

  it("surplusRatio = 0 and surplusMultiplier = 1.0 when budget < idealRemainingSpend", () => {
    const allBoardPlayers = [
      makePlayer("Player A", ["C"], 30),
      makePlayer("Player B", ["SS"], 35),
      makePlayer("Player C", ["OF"], 40),
      makePlayer("Player D", ["OF"], 38),
      makePlayer("Player E", ["OF"], 36),
      makePlayer("Player F", ["OF"], 34),
    ];

    // Budget is very small — definitely a deficit
    const state = computeDraftBoardState(
      allBoardPlayers,
      [],
      10, // only $10 remaining, idealSpend will be much higher
    );

    expect(state.surplusRatio).toBe(0);
    expect(state.surplusMultiplier).toBe(1.0);
  });
});
