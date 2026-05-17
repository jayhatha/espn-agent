/**
 * Phase 108: WaiverRecommendationAgent regression tests.
 *
 * These tests fail before the Phase 108 rewiring because:
 * 1. `evaluateAddDropImpact()` method doesn't exist on WaiverRecommendationAgent
 * 2. Legality comes from `canReplacePosition()` (heuristic), not allocator gaps
 */

import { describe, it, expect, vi } from "vitest";
import { WaiverRecommendationAgent } from "../waiver-recommendation.js";

// ─── Helpers / stubs ──────────────────────────────────────────────────────────

/**
 * Minimal chainable Kysely mock.
 * Strips "table as alias" → "table" for key lookups.
 */
function createMockDb(data: Record<string, unknown> = {}): any {
  const normalize = (t: string) => t.split(" as ")[0].trim();

  const chain = (table: string, joins: string[] = []): any => {
    const key = [normalize(table), ...joins.map(normalize)].join("_");
    const obj: any = {
      where: (..._: any[]) => chain(table, joins),
      select: (_: any) => chain(table, joins),
      selectAll: (_?: any) => chain(table, joins),
      orderBy: (..._: any[]) => chain(table, joins),
      innerJoin: (jt: string, ..._: any[]) => chain(table, [...joins, jt]),
      limit: (_: number) => chain(table, joins),
      execute: () => data[`${key}_list`] ?? [],
      executeTakeFirst: () => data[`${key}_single`] ?? undefined,
      executeTakeFirstOrThrow: () => {
        const v = data[`${key}_single`];
        if (!v) throw new Error(`No mock for ${key}_single`);
        return v;
      },
    };
    return obj;
  };

  return { selectFrom: (t: string) => chain(t) };
}

/** Stub ScenarioEvaluationAgent that returns a canned result */
function makeScenarioStub(
  overrides: Partial<{
    isLegal: boolean;
    blockingIssues: string[];
    deltaOverallPoints: number;
  }> = {},
) {
  return {
    evaluateWaiver: vi.fn().mockResolvedValue({
      isLegal: overrides.isLegal ?? true,
      blockingIssues: overrides.blockingIssues ?? [],
      gaps: [],
      deltaOverallPoints: overrides.deltaOverallPoints ?? 1.5,
      categoryDeltas: {},
      degradedReasons: [],
    }),
    loadState: vi.fn().mockResolvedValue({ teams: [], categories: [] }),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WaiverRecommendationAgent — Phase 108 evaluateAddDropImpact", () => {
  it("evaluateAddDropImpact method exists on WaiverRecommendationAgent", () => {
    // FAILING before fix: method doesn't exist
    const agent = new WaiverRecommendationAgent(
      createMockDb() as any,
      {} as any, // standingsAgent stub
      {} as any, // espnAdapter stub
      undefined,
      makeScenarioStub() as any, // scenarioEvaluationAgent — NEW constructor param, fails before fix
    );

    expect(typeof agent.evaluateAddDropImpact).toBe("function");
  });

  it("evaluateAddDropImpact returns isLegal from ScenarioEvaluationAgent, not canReplacePosition", async () => {
    // FAILING before fix: no evaluateAddDropImpact method, no ScenarioEvaluationAgent injection
    const scenarioStub = makeScenarioStub({
      isLegal: true,
      deltaOverallPoints: 2.0,
    });

    const db = createMockDb({
      league_daily_snapshot_single: {
        league_id: 1,
        snapshot_date: "2026-05-01",
        projections_run_id: 42,
      },
    });

    const agent = new WaiverRecommendationAgent(
      db as any,
      {} as any,
      {} as any,
      undefined,
      scenarioStub as any,
    );

    const result = await agent.evaluateAddDropImpact({
      leagueId: 1,
      teamId: 10,
      snapshotDate: "2026-05-01",
      projectionsRunId: 42,
      addPlayerId: 99,
      dropPlayerId: 11,
    });

    expect(result.isLegal).toBe(true);
    expect(result.deltaOverallPoints).toBe(2.0);
    expect(scenarioStub.evaluateWaiver).toHaveBeenCalledOnce();
  });

  it("evaluateAddDropImpact surfaces blocking issues from ScenarioEvaluationAgent on illegal swap", async () => {
    // FAILING before fix: evaluateAddDropImpact doesn't exist
    const scenarioStub = makeScenarioStub({
      isLegal: false,
      blockingIssues: ["Cannot fill OF slot: no eligible player"],
      deltaOverallPoints: 0.3,
    });

    const db = createMockDb({
      league_daily_snapshot_single: {
        league_id: 1,
        snapshot_date: "2026-05-01",
        projections_run_id: 42,
      },
    });

    const agent = new WaiverRecommendationAgent(
      db as any,
      {} as any,
      {} as any,
      undefined,
      scenarioStub as any,
    );

    const result = await agent.evaluateAddDropImpact({
      leagueId: 1,
      teamId: 10,
      snapshotDate: "2026-05-01",
      projectionsRunId: 42,
      addPlayerId: 99,
      dropPlayerId: 11,
    });

    expect(result.isLegal).toBe(false);
    expect(result.blockingIssues.length).toBeGreaterThan(0);
    expect(result.blockingIssues[0]).toContain("OF slot");
  });

  it("canReplacePosition is not called during evaluateAddDropImpact", async () => {
    // FAILING before fix: canReplacePosition is the current legality gate
    // After fix: legality comes from ScenarioEvaluationAgent (allocator-driven)
    const scenarioStub = makeScenarioStub();

    const db = createMockDb({
      league_daily_snapshot_single: {
        league_id: 1,
        snapshot_date: "2026-05-01",
        projections_run_id: 42,
      },
    });

    const agent = new WaiverRecommendationAgent(
      db as any,
      {} as any,
      {} as any,
      undefined,
      scenarioStub as any,
    ) as any;

    // canReplacePosition should not exist or not be called for exact evaluation
    const canReplacePositionSpy = agent.canReplacePosition
      ? vi.spyOn(agent, "canReplacePosition")
      : null;

    await agent.evaluateAddDropImpact({
      leagueId: 1,
      teamId: 10,
      snapshotDate: "2026-05-01",
      projectionsRunId: 42,
      addPlayerId: 99,
      dropPlayerId: 11,
    });

    // After Phase 108: canReplacePosition should never be called for exact evaluation
    if (canReplacePositionSpy) {
      expect(canReplacePositionSpy).not.toHaveBeenCalled();
    }
  });
});
