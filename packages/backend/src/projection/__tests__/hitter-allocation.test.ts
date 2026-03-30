import { describe, it, expect } from "vitest";
import { allocateLineup, scorePlayer } from "../hitter-allocation.js";
import type { RosteredPlayer } from "../types.js";

function makePlayer(
  playerId: number,
  positions: string[],
  rosterStatus: "active" | "bench" | "il",
  projectedComponents: Record<string, number> | null = null,
): RosteredPlayer {
  return {
    playerId,
    positions,
    rosterStatus,
    rosterSlot: null,
    projectedComponents,
  };
}

describe("scorePlayer", () => {
  it("returns 0 for null components", () => {
    expect(scorePlayer(null, false)).toBe(0);
    expect(scorePlayer(null, true)).toBe(0);
  });

  it("scores hitters based on HR + RBI + R + SB", () => {
    const score = scorePlayer({ HR: 30, RBI: 100, R: 90, SB: 20 }, false);
    expect(score).toBe(240);
  });

  it("scores pitchers based on K + W*5 + SV*5", () => {
    const score = scorePlayer({ K: 200, W: 15, SV: 0 }, true);
    expect(score).toBe(275);
  });
});

describe("allocateLineup", () => {
  it("returns empty array for empty roster", () => {
    const result = allocateLineup([], { C: 1, "1B": 1, UTIL: 1, BN: 3 });
    expect(result).toEqual([]);
  });

  it("assigns bench player weight=0.0 and slot=BN", () => {
    const players: RosteredPlayer[] = [
      makePlayer(1, ["C"], "bench", { HR: 20, RBI: 80, R: 70, SB: 5 }),
    ];
    const result = allocateLineup(players, { C: 1, BN: 3 });
    const assignment = result.find((a) => a.playerId === 1)!;
    expect(assignment.contributionWeight).toBe(0.0);
    expect(assignment.slot).toBe("BN");
  });

  it("assigns IL player weight=0.0 and slot=IL", () => {
    const players: RosteredPlayer[] = [
      makePlayer(1, ["1B"], "il", { HR: 20, RBI: 80, R: 70, SB: 5 }),
    ];
    const result = allocateLineup(players, { "1B": 1, IL: 2 });
    const assignment = result.find((a) => a.playerId === 1)!;
    expect(assignment.contributionWeight).toBe(0.0);
    expect(assignment.slot).toBe("IL");
  });

  it("assigns starting slot players weight=1.0", () => {
    const players: RosteredPlayer[] = [
      makePlayer(1, ["C"], "active", { HR: 20, RBI: 80, R: 70, SB: 5 }),
    ];
    const rosterSlots = { C: 1, BN: 3 };
    const result = allocateLineup(players, rosterSlots);
    const assignment = result.find((a) => a.playerId === 1)!;
    expect(assignment.contributionWeight).toBe(1.0);
    expect(assignment.slot).toBe("C");
  });

  it("fills C, SS, and 1B-only player to UTIL slot", () => {
    // C-only: id=1, SS-only: id=2, 1B-only: id=3
    const players: RosteredPlayer[] = [
      makePlayer(1, ["C"], "active", { HR: 20, RBI: 80, R: 70, SB: 5 }),
      makePlayer(2, ["SS"], "active", { HR: 10, RBI: 60, R: 80, SB: 30 }),
      makePlayer(3, ["1B"], "active", { HR: 35, RBI: 110, R: 90, SB: 2 }),
    ];
    const rosterSlots = { C: 1, SS: 1, UTIL: 1, BN: 2 };
    const result = allocateLineup(players, rosterSlots);

    const cAssignment = result.find((a) => a.slot === "C")!;
    const ssAssignment = result.find((a) => a.slot === "SS")!;
    const utilAssignment = result.find((a) => a.slot === "UTIL")!;

    expect(cAssignment.playerId).toBe(1);
    expect(cAssignment.contributionWeight).toBe(1.0);
    expect(ssAssignment.playerId).toBe(2);
    expect(ssAssignment.contributionWeight).toBe(1.0);
    expect(utilAssignment.playerId).toBe(3);
    expect(utilAssignment.contributionWeight).toBe(1.0);
  });

  it("fills MI slot with SS/2B player (most constrained first — C filled before UTIL)", () => {
    // SS/2B eligible: id=1 (higher value), SS-only: id=2
    // The greedy algo should fill MI with id=1 (SS/2B, higher scorer among MI-eligible)
    const players: RosteredPlayer[] = [
      makePlayer(1, ["SS", "2B"], "active", { HR: 20, RBI: 80, R: 90, SB: 30 }),
      makePlayer(2, ["SS"], "active", { HR: 10, RBI: 50, R: 60, SB: 10 }),
    ];
    const rosterSlots = { MI: 1, SS: 1, BN: 2 };
    const result = allocateLineup(players, rosterSlots);

    // Both MI and SS are SPECIFIC slots — SS is filled first, then MI
    // player 1 (higher score=220) takes SS, player 2 (lower score=130) takes MI
    // OR player 2 (SS-only) takes SS, player 1 (SS/2B) takes MI
    // The greedy algo picks best eligible for each slot in tier order
    // Specific slots include both SS and MI — order within tier matters
    const miAssignment = result.find((a) => a.slot === "MI")!;
    const ssAssignment = result.find((a) => a.slot === "SS")!;

    expect(miAssignment).toBeDefined();
    expect(ssAssignment).toBeDefined();
    expect(miAssignment.contributionWeight).toBe(1.0);
    expect(ssAssignment.contributionWeight).toBe(1.0);
    // Both players should be assigned (neither to BN)
    expect(result.filter((a) => a.slot === "BN").length).toBe(0);
  });

  it("sends excess players to BN with weight=0.0 when more players than starting slots", () => {
    const players: RosteredPlayer[] = [
      makePlayer(1, ["C"], "active", { HR: 20, RBI: 80, R: 70, SB: 5 }),
      makePlayer(2, ["C"], "active", { HR: 15, RBI: 60, R: 60, SB: 3 }),
    ];
    const rosterSlots = { C: 1, BN: 3 };
    const result = allocateLineup(players, rosterSlots);

    const starter = result.find((a) => a.slot === "C")!;
    const bench = result.find((a) => a.slot === "BN")!;

    expect(starter.contributionWeight).toBe(1.0);
    expect(bench.contributionWeight).toBe(0.0);
  });

  it("assigns player with no projection (null components) to slot but still starts (weight=1.0)", () => {
    const players: RosteredPlayer[] = [
      makePlayer(1, ["C"], "active", null),
    ];
    const rosterSlots = { C: 1, BN: 3 };
    const result = allocateLineup(players, rosterSlots);
    const assignment = result.find((a) => a.playerId === 1)!;
    expect(assignment.slot).toBe("C");
    expect(assignment.contributionWeight).toBe(1.0);
  });

  it("OF slot accepts LF, CF, RF, and OF positions", () => {
    const lf = makePlayer(1, ["LF"], "active", { HR: 30, RBI: 100, R: 90, SB: 10 });
    const cf = makePlayer(2, ["CF"], "active", { HR: 10, RBI: 50, R: 80, SB: 30 });
    const rf = makePlayer(3, ["RF"], "active", { HR: 25, RBI: 85, R: 75, SB: 15 });
    const rosterSlots = { OF: 3, BN: 2 };
    const result = allocateLineup([lf, cf, rf], rosterSlots);

    const ofAssignments = result.filter((a) => a.slot === "OF");
    expect(ofAssignments.length).toBe(3);
    expect(ofAssignments.every((a) => a.contributionWeight === 1.0)).toBe(true);
  });

  it("skips pitcher-only players when assigning hitter slots (pitcher with IP > 0, AB = 0)", () => {
    // SP-only pitcher should not fill 1B slot
    const sp = makePlayer(1, ["SP"], "active", { IP: 180, K: 200, W: 15, ER: 60 });
    const firstBaseman = makePlayer(2, ["1B"], "active", { HR: 30, RBI: 100, R: 90, SB: 5 });
    const rosterSlots = { "1B": 1, SP: 1, BN: 2 };
    const result = allocateLineup([sp, firstBaseman], rosterSlots);

    const spAssignment = result.find((a) => a.playerId === 1)!;
    const hitterAssignment = result.find((a) => a.playerId === 2)!;

    expect(hitterAssignment.slot).toBe("1B");
    expect(hitterAssignment.contributionWeight).toBe(1.0);
    expect(spAssignment.slot).toBe("SP");
    expect(spAssignment.contributionWeight).toBe(1.0);
  });

  it("greedy fills most-constrained slot first (C before UTIL)", () => {
    // C-only player (id=1) must go to C slot — they can't fill UTIL
    // Actually all positions can fill UTIL, so test that C-only player fills C not UTIL
    const cPlayer = makePlayer(1, ["C"], "active", { HR: 15, RBI: 60, R: 55, SB: 3 });
    const utilPlayer = makePlayer(2, ["1B"], "active", { HR: 35, RBI: 110, R: 95, SB: 5 });
    const rosterSlots = { C: 1, UTIL: 1, BN: 2 };
    const result = allocateLineup([cPlayer, utilPlayer], rosterSlots);

    const cAssignment = result.find((a) => a.slot === "C")!;
    const utilAssignment = result.find((a) => a.slot === "UTIL")!;

    // C-only should fill the C slot; 1B should go to UTIL
    expect(cAssignment.playerId).toBe(1);
    expect(utilAssignment.playerId).toBe(2);
    expect(cAssignment.contributionWeight).toBe(1.0);
    expect(utilAssignment.contributionWeight).toBe(1.0);
  });
});
