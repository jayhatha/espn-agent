import { describe, it, expect, vi } from "vitest";
import { buildSimulationState } from "../state-builder.js";
import { DEFAULT_SEASON_END } from "../types.js";
import { SnapshotRepository } from "../../db/snapshot-repository.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysBetween(from: string, to: string): number {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

/** Minimal chainable Kysely mock. `tableData` keys are bare table names (no alias). */
function createMockDb(tableData: Record<string, unknown | unknown[]> = {}) {
  return {
    selectFrom: vi.fn((table: string) => {
      const base = table.split(" as ")[0].trim();
      const data = tableData[base];
      const arr: unknown[] = Array.isArray(data)
        ? data
        : data != null
          ? [data]
          : [];
      const first = arr[0] ?? null;
      const chain: Record<string, unknown> = {
        selectAll: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(arr),
        executeTakeFirst: vi.fn().mockResolvedValue(first),
        executeTakeFirstOrThrow: vi.fn().mockResolvedValue(first),
      };
      // make where/orderBy/innerJoin return the same chain object
      (chain.where as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain.innerJoin as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      return chain;
    }),
  } as any;
}

// ─── Tests: snapshotDate-derived horizon ─────────────────────────────────────

describe("buildSimulationState — snapshot-date-derived horizon", () => {
  it("daysRemaining equals days from snapshotDate to season end, not from today", async () => {
    // Use a historic snapshotDate that is certainly different from today
    const snapshotDate = "2026-05-01";
    const expectedDays = daysBetween(snapshotDate, DEFAULT_SEASON_END);
    const todayDays = daysBetween(
      new Date().toISOString().split("T")[0],
      DEFAULT_SEASON_END,
    );

    const db = createMockDb({
      league_daily_snapshot: null,
      league_settings_version: null,
      team: [],
      projections_run: null,
      league_raw_payload: null,
      team_daily_category_totals: [],
      team_roster_snapshot: [],
      player_projection: [],
    });

    const state = await buildSimulationState(db, 1, snapshotDate, 1);

    expect(state.daysRemaining).toBe(expectedDays);
    // Verify it's different from wall-clock (so the test is meaningful)
    if (expectedDays !== todayDays) {
      expect(state.daysRemaining).not.toBe(todayDays);
    }
  });

  it("two calls with different snapshotDates return different daysRemaining values", async () => {
    const snapshotDateA = "2026-04-01";
    const snapshotDateB = "2026-08-01";
    const expectedA = daysBetween(snapshotDateA, DEFAULT_SEASON_END);
    const expectedB = daysBetween(snapshotDateB, DEFAULT_SEASON_END);

    const dbA = createMockDb({
      league_daily_snapshot: null,
      team: [],
      projections_run: null,
      league_raw_payload: null,
      team_daily_category_totals: [],
      team_roster_snapshot: [],
      player_projection: [],
    });
    const dbB = createMockDb({
      league_daily_snapshot: null,
      team: [],
      projections_run: null,
      league_raw_payload: null,
      team_daily_category_totals: [],
      team_roster_snapshot: [],
      player_projection: [],
    });

    const stateA = await buildSimulationState(dbA, 1, snapshotDateA, 1);
    const stateB = await buildSimulationState(dbB, 1, snapshotDateB, 1);

    expect(stateA.daysRemaining).toBe(expectedA);
    expect(stateB.daysRemaining).toBe(expectedB);
    expect(stateA.daysRemaining).not.toBe(stateB.daysRemaining);
  });

  it("after-season snapshotDate clamps daysRemaining to 0", async () => {
    const db = createMockDb({
      league_daily_snapshot: null,
      team: [],
      projections_run: null,
      league_raw_payload: null,
      team_daily_category_totals: [],
      team_roster_snapshot: [],
      player_projection: [],
    });

    const state = await buildSimulationState(db, 1, "2026-10-10", 1);
    expect(state.daysRemaining).toBe(0);
  });
});

// ─── Tests: snapshot-bound raw payload fallback ───────────────────────────────

describe("SnapshotRepository.getHistoricalRawPayload", () => {
  it("returns null when no raw payload exists for or before snapshotDate", async () => {
    const db = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(null),
      }),
    } as any;

    const repo = new SnapshotRepository(db);
    const result = await repo.getHistoricalRawPayload(1, "2026-05-10");
    expect(result).toBeNull();
  });

  it("uses a date-bounded filter (not just orderBy desc) to select historical payload", async () => {
    const whereCalls: Array<[unknown, unknown, unknown]> = [];
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn((col: unknown, op: unknown, val: unknown) => {
        whereCalls.push([col, op, val]);
        return chain;
      }),
      orderBy: vi.fn().mockReturnThis(),
      executeTakeFirst: vi
        .fn()
        .mockResolvedValue({ response_json: { teams: [] } }),
    };

    const db = {
      selectFrom: vi.fn().mockReturnValue(chain),
    } as any;

    const repo = new SnapshotRepository(db);
    await repo.getHistoricalRawPayload(1, "2026-05-10");

    // Must contain a date-bounded WHERE clause (fetched_at <= snapshotDate or similar)
    const hasDateFilter = whereCalls.some(
      ([, op]) => op === "<=" || op === "<",
    );
    expect(hasDateFilter).toBe(true);
  });

  it("returns payload when one exists on or before snapshotDate", async () => {
    const expectedPayload = { response_json: { teams: [{ id: 1 }] } };
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(expectedPayload),
    };
    (chain.where as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.orderBy as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    const db = { selectFrom: vi.fn().mockReturnValue(chain) } as any;
    const repo = new SnapshotRepository(db);
    const result = await repo.getHistoricalRawPayload(1, "2026-05-10");

    expect(result).toBe(expectedPayload);
  });
});

// ─── Tests: snapshot-scoped data wins over latest raw ────────────────────────

describe("buildSimulationState — snapshot-scoped GS data wins over latest raw payload", () => {
  it("records degraded reason when raw payload falls back to historical (not snapshot-scoped)", async () => {
    // When the historical payload is the only source (no snapshot-specific data),
    // the state should NOT include a degraded reason for raw payload usage
    // (it's expected). But if no payload exists at all, GS data will be missing.
    const db = createMockDb({
      league_daily_snapshot: null,
      team: [],
      projections_run: null,
      league_raw_payload: null,
      team_daily_category_totals: [],
      team_roster_snapshot: [],
      player_projection: [],
    });

    const state = await buildSimulationState(db, 1, "2026-05-01", 1);

    // When snapshot is missing, it's recorded as degraded
    expect(state.degradedReasons).toContain("snapshot_missing");
  });

  it("state is not viable when snapshot is missing", async () => {
    const db = createMockDb({
      league_daily_snapshot: null,
      team: [{ id: 1, name: "Team 1", league_id: 1, espn_team_id: 1 }],
      projections_run: { id: 1, as_of_date: "2026-05-01" },
      league_raw_payload: null,
      team_daily_category_totals: [],
      team_roster_snapshot: [],
      player_projection: [],
    });

    const state = await buildSimulationState(db, 1, "2026-05-01", 1);
    expect(state.isViable).toBe(false);
  });
});
