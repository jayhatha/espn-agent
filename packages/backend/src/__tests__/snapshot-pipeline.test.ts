import { describe, it, expect, vi } from "vitest";
import { SnapshotRepository } from "../db/snapshot-repository.js";

/**
 * Integration tests for snapshot pipeline seams.
 *
 * Tests three critical contracts:
 * 1. SnapshotRepository.getPlayerProjections returns [] for empty playerIds (no invalid IN ())
 * 2. is_degraded=true path triggers when projections are missing
 * 3. is_degraded path triggers when projections are stale (different date)
 */

// ── Test 1: empty-array guard in getPlayerProjections ────────────────────────

describe("SnapshotRepository.getPlayerProjections", () => {
  it("returns empty array immediately when playerIds is [] — never calls DB", async () => {
    const mockDb = {
      selectFrom: vi.fn(),
    } as any;

    const repo = new SnapshotRepository(mockDb);
    const result = await repo.getPlayerProjections(1, []);

    expect(result).toEqual([]);
    // Kysely's selectFrom must NOT be called — would generate invalid IN () SQL
    expect(mockDb.selectFrom).not.toHaveBeenCalled();
  });

  it("returns all projections for a run when playerIds is undefined", async () => {
    const rows = [
      { player_id: 10, stat_components_json: { AB: 400, H: 110 } },
      { player_id: 11, stat_components_json: { IP: 150, ER: 50 } },
    ];

    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(rows),
      }),
    } as any;

    const repo = new SnapshotRepository(mockDb);
    const result = await repo.getPlayerProjections(42);

    expect(result).toEqual(rows);
    expect(mockDb.selectFrom).toHaveBeenCalledWith("player_projection");
  });

  it("adds WHERE player_id IN clause when playerIds is a non-empty array", async () => {
    const rows = [{ player_id: 5, stat_components_json: { AB: 300 } }];
    const whereMock = vi.fn().mockReturnThis();
    const executeMock = vi.fn().mockResolvedValue(rows);

    const mockDb = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: whereMock,
        execute: executeMock,
      }),
    } as any;

    const repo = new SnapshotRepository(mockDb);
    const result = await repo.getPlayerProjections(42, [5]);

    expect(result).toEqual(rows);
    // Should have been called with "player_id", "in", [5]
    const inCall = whereMock.mock.calls.find((call: any[]) => call[1] === "in");
    expect(inCall).toBeDefined();
    expect(inCall![2]).toEqual([5]);
  });
});

// ── Test 2: degraded flag logic — projections missing ────────────────────────

describe("snapshot degraded flag logic", () => {
  /**
   * The orchestrator's degraded logic (extracted for unit testing):
   *   isDegraded = !projectionsRun || projDate !== snapDate || staleness !== "fresh"
   */
  function computeDegradedState(
    projectionsRun: { as_of_date: string; staleness: string } | undefined,
    snapshotDate: string,
  ): { isDegraded: boolean; degradedReasons: string[] } {
    const normDate = (d: unknown): string => {
      if (d instanceof Date) return (d as Date).toISOString().split("T")[0];
      return String(d).split("T")[0];
    };
    const projDate = projectionsRun ? normDate(projectionsRun.as_of_date) : "";
    const snapDate = normDate(snapshotDate);

    const isDegraded =
      !projectionsRun ||
      projDate !== snapDate ||
      projectionsRun.staleness !== "fresh";

    const degradedReasons: string[] = [];
    if (!projectionsRun) {
      degradedReasons.push("projections_missing");
    } else if (projDate !== snapDate) {
      degradedReasons.push("projections_stale");
    } else if (projectionsRun.staleness !== "fresh") {
      degradedReasons.push("projections_stale");
    }

    return { isDegraded, degradedReasons };
  }

  it("is_degraded=true + projections_missing when no projections run exists", () => {
    const { isDegraded, degradedReasons } = computeDegradedState(
      undefined,
      "2026-05-06",
    );

    expect(isDegraded).toBe(true);
    expect(degradedReasons).toContain("projections_missing");
  });

  it("is_degraded=true + projections_stale when run date differs from snapshot date", () => {
    const { isDegraded, degradedReasons } = computeDegradedState(
      { as_of_date: "2026-05-05", staleness: "fresh" },
      "2026-05-06",
    );

    expect(isDegraded).toBe(true);
    expect(degradedReasons).toContain("projections_stale");
  });

  it("is_degraded=true + projections_stale when staleness is not fresh", () => {
    const { isDegraded, degradedReasons } = computeDegradedState(
      { as_of_date: "2026-05-06", staleness: "stale" },
      "2026-05-06",
    );

    expect(isDegraded).toBe(true);
    expect(degradedReasons).toContain("projections_stale");
  });

  it("is_degraded=false when projections run matches snapshot date and is fresh", () => {
    const { isDegraded, degradedReasons } = computeDegradedState(
      { as_of_date: "2026-05-06", staleness: "fresh" },
      "2026-05-06",
    );

    expect(isDegraded).toBe(false);
    expect(degradedReasons).toHaveLength(0);
  });

  it("is_degraded=false when projections run date is a Date object matching snapshot", () => {
    // DB may return Date objects rather than strings
    const { isDegraded, degradedReasons } = computeDegradedState(
      { as_of_date: new Date("2026-05-06") as any, staleness: "fresh" },
      "2026-05-06",
    );

    expect(isDegraded).toBe(false);
    expect(degradedReasons).toHaveLength(0);
  });
});
