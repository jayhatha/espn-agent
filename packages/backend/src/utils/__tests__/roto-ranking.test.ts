import { describe, it, expect } from "vitest";
import {
  assignRanksWithTies,
  computeOverallRotoPoints,
} from "../../utils/roto-ranking.js";

// ─── assignRanksWithTies ───────────────────────────────────────────────────

describe("assignRanksWithTies", () => {
  it("assigns sequential ranks and full roto points when no ties", () => {
    // Arrange: 4 teams sorted descending by value (HIGHER_BETTER pre-sorted)
    const sorted = [
      { teamId: 1, value: 200 },
      { teamId: 2, value: 180 },
      { teamId: 3, value: 160 },
      { teamId: 4, value: 140 },
    ];
    const numTeams = 4;

    // Act
    const result = assignRanksWithTies(sorted, numTeams);

    // Assert: rank 1 → 4 pts, rank 2 → 3 pts, rank 3 → 2 pts, rank 4 → 1 pt
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ teamId: 1, rank: 1, rotoPoints: 4 });
    expect(result[1]).toMatchObject({ teamId: 2, rank: 2, rotoPoints: 3 });
    expect(result[2]).toMatchObject({ teamId: 3, rank: 3, rotoPoints: 2 });
    expect(result[3]).toMatchObject({ teamId: 4, rank: 4, rotoPoints: 1 });
  });

  it("splits roto points evenly when two teams tie for first", () => {
    // Arrange: teams 1 and 2 tie at 200; team 3 at 150
    const sorted = [
      { teamId: 1, value: 200 },
      { teamId: 2, value: 200 },
      { teamId: 3, value: 150 },
    ];
    const numTeams = 3;

    // Act
    const result = assignRanksWithTies(sorted, numTeams);

    // Assert: positions 1 and 2 → (3+2)/2 = 2.5 pts each; team3 rank 3 → 1 pt
    expect(result[0]).toMatchObject({ teamId: 1, rank: 1, rotoPoints: 2.5 });
    expect(result[1]).toMatchObject({ teamId: 2, rank: 1, rotoPoints: 2.5 });
    expect(result[2]).toMatchObject({ teamId: 3, rank: 3, rotoPoints: 1 });
  });

  it("splits roto points for a three-way tie in the middle", () => {
    // Arrange: 5 teams; positions 2,3,4 are tied
    const sorted = [
      { teamId: 1, value: 300 },
      { teamId: 2, value: 200 },
      { teamId: 3, value: 200 },
      { teamId: 4, value: 200 },
      { teamId: 5, value: 100 },
    ];
    const numTeams = 5;

    // Act
    const result = assignRanksWithTies(sorted, numTeams);

    // Assert: team1 rank 1 → 5 pts; tied teams rank 2 → (4+3+2)/3 = 3 pts; team5 rank 5 → 1 pt
    expect(result[0]).toMatchObject({ teamId: 1, rank: 1, rotoPoints: 5 });
    expect(result[1]).toMatchObject({ teamId: 2, rank: 2, rotoPoints: 3 });
    expect(result[2]).toMatchObject({ teamId: 3, rank: 2, rotoPoints: 3 });
    expect(result[3]).toMatchObject({ teamId: 4, rank: 2, rotoPoints: 3 });
    expect(result[4]).toMatchObject({ teamId: 5, rank: 5, rotoPoints: 1 });
  });

  it("handles all teams tied (everyone gets the mean roto points)", () => {
    // Arrange: all 4 teams have the same value
    const sorted = [
      { teamId: 1, value: 100 },
      { teamId: 2, value: 100 },
      { teamId: 3, value: 100 },
      { teamId: 4, value: 100 },
    ];
    const numTeams = 4;

    // Act
    const result = assignRanksWithTies(sorted, numTeams);

    // Assert: (4+3+2+1)/4 = 2.5 pts each; all rank 1
    for (const team of result) {
      expect(team.rank).toBe(1);
      expect(team.rotoPoints).toBeCloseTo(2.5);
    }
  });

  it("handles a single team", () => {
    const sorted = [{ teamId: 42, value: 999 }];
    const result = assignRanksWithTies(sorted, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ teamId: 42, rank: 1, rotoPoints: 1 });
  });

  it("returns empty array for empty input", () => {
    expect(assignRanksWithTies([], 10)).toHaveLength(0);
  });

  it("total roto points always sums to numTeams*(numTeams+1)/2", () => {
    // This invariant must hold regardless of ties
    const sorted = [
      { teamId: 1, value: 500 },
      { teamId: 2, value: 300 },
      { teamId: 3, value: 300 },
      { teamId: 4, value: 200 },
      { teamId: 5, value: 100 },
    ];
    const numTeams = 5;
    const result = assignRanksWithTies(sorted, numTeams);
    const total = result.reduce((sum, t) => sum + t.rotoPoints, 0);
    // 5+4+3+2+1 = 15
    expect(total).toBeCloseTo((numTeams * (numTeams + 1)) / 2);
  });
});

// ─── computeOverallRotoPoints ──────────────────────────────────────────────

describe("computeOverallRotoPoints", () => {
  it("sums roto points across all categories", () => {
    // Arrange: 2 categories, 3 teams
    const catA = [
      { teamId: 1, rotoPoints: 3 },
      { teamId: 2, rotoPoints: 2 },
      { teamId: 3, rotoPoints: 1 },
    ];
    const catB = [
      { teamId: 1, rotoPoints: 1 },
      { teamId: 2, rotoPoints: 3 },
      { teamId: 3, rotoPoints: 2 },
    ];

    // Act
    const result = computeOverallRotoPoints([catA, catB]);

    // Assert
    expect(result.get(1)).toBe(4); // 3+1
    expect(result.get(2)).toBe(5); // 2+3
    expect(result.get(3)).toBe(3); // 1+2
  });

  it("handles a single category", () => {
    const cat = [
      { teamId: 10, rotoPoints: 7 },
      { teamId: 11, rotoPoints: 3 },
    ];
    const result = computeOverallRotoPoints([cat]);
    expect(result.get(10)).toBe(7);
    expect(result.get(11)).toBe(3);
  });

  it("returns empty map for empty input", () => {
    expect(computeOverallRotoPoints([])).toEqual(new Map());
  });

  it("total overall points equals sum of all category points", () => {
    const catA = [
      { teamId: 1, rotoPoints: 4 },
      { teamId: 2, rotoPoints: 3 },
      { teamId: 3, rotoPoints: 2 },
      { teamId: 4, rotoPoints: 1 },
    ];
    const catB = [
      { teamId: 1, rotoPoints: 1 },
      { teamId: 2, rotoPoints: 2 },
      { teamId: 3, rotoPoints: 3 },
      { teamId: 4, rotoPoints: 4 },
    ];
    const result = computeOverallRotoPoints([catA, catB]);
    const grandTotal = Array.from(result.values()).reduce((a, b) => a + b, 0);
    // 4 categories with sum 10 points each (4+3+2+1) × 2 cats = 20
    expect(grandTotal).toBeCloseTo(20);
  });
});
