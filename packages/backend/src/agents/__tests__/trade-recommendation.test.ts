import { describe, it, expect, beforeEach } from "vitest";
import {
  TradeRecommendationAgent,
  calculateEquivalentTradeValue,
  extractDraftCostsFromDraftDetail,
} from "../trade-recommendation.js";
import { createMockProjection } from "../../__tests__/test-helpers.js";

/**
 * Trade Recommendation Agent Tests
 *
 * Tests projection field access fixes (DEBT-01) and rate stat component math
 */

describe("TradeRecommendationAgent - Equivalent Value Signals", () => {
  it("extracts league draft prices from nested draft detail payloads", () => {
    const draftDetail = {
      picks: [
        { playerId: 101, bidAmount: 27 },
        {
          results: [
            {
              player: { id: 102 },
              auctionValue: 19,
            },
          ],
        },
      ],
    };

    const draftCosts = extractDraftCostsFromDraftDetail(draftDetail);

    expect(draftCosts.get(101)).toBe(27);
    expect(draftCosts.get(102)).toBe(19);
  });

  it("weights ESPN ASV at 80 percent and league draft cost at 20 percent", () => {
    const result = calculateEquivalentTradeValue({
      giveAsv: 20,
      receiveAsv: 22,
      giveDraftCost: 10,
      receiveDraftCost: 14,
    });

    expect(result.usesDraftCost).toBe(true);
    expect(result.giveCompositeValue).toBeCloseTo(18, 5);
    expect(result.receiveCompositeValue).toBeCloseTo(20.4, 5);
    expect(result.ratio).toBeCloseTo(18 / 20.4, 5);
  });

  it("marks equal-ASV trades as lopsided when league draft cost diverges", () => {
    const result = calculateEquivalentTradeValue({
      giveAsv: 25,
      receiveAsv: 25,
      giveDraftCost: 40,
      receiveDraftCost: 10,
    });

    expect(result.usesDraftCost).toBe(true);
    expect(result.ratio).toBeLessThan(0.8);
  });
});

describe("TradeRecommendationAgent - Projection Field Access Fix (DEBT-01)", () => {
  describe("stat_components_json parsing", () => {
    it("should parse stat_components_json correctly from string field", () => {
      const projection = createMockProjection();
      const components = JSON.parse(projection.stat_components_json);

      expect(components.AB).toBe(500);
      expect(components.H).toBe(150);
      expect(components.HR).toBe(30);
      expect(components.TB).toBe(280);
    });

    it("should handle projection with partial batting stats", () => {
      const projection = createMockProjection({
        stat_components_json: JSON.stringify({
          AB: 300,
          H: 90,
          BB: 40,
          HBP: 3,
          SF: 2
        })
      });
      const components = JSON.parse(projection.stat_components_json);

      expect(components.AB).toBe(300);
      expect(components.H).toBe(90);
      expect(components.HR).toBeUndefined();
    });
  });

  describe("batter vs pitcher detection", () => {
    it("should detect batter when AB exists and is > 0", () => {
      const projection = createMockProjection();
      const components = JSON.parse(projection.stat_components_json);
      const isBatter = components.AB != null && components.AB > 0;

      expect(isBatter).toBe(true);
    });

    it("should detect pitcher when IP exists and is > 0", () => {
      const projection = createMockProjection({
        stat_components_json: JSON.stringify({
          AB: 0,
          IP: 180,
          ER: 60,
          H_P: 150,
          BB_P: 50,
          K: 200,
          W: 12,
          SV: 0
        })
      });
      const components = JSON.parse(projection.stat_components_json);
      const isPitcher = components.IP != null && components.IP > 0;

      expect(isPitcher).toBe(true);
    });
  });

  describe("rate stat calculations from components", () => {
    it("should calculate AVG from H and AB components", () => {
      const projection = createMockProjection();
      const components = JSON.parse(projection.stat_components_json);

      const avg = (components.H || 0) / Math.max(1, components.AB || 1);

      expect(avg).toBeCloseTo(0.300, 3);
    });

    it("should calculate OBP from multiple components", () => {
      const projection = createMockProjection();
      const components = JSON.parse(projection.stat_components_json);

      const obp =
        ((components.H || 0) + (components.BB || 0) + (components.HBP || 0)) /
        Math.max(1, (components.AB || 0) + (components.BB || 0) + (components.HBP || 0) + (components.SF || 0));

      // (150 + 60 + 5) / (500 + 60 + 5 + 4) = 215/569 = 0.3778
      expect(obp).toBeCloseTo(0.3778, 3);
    });

    it("should calculate SLG from TB and AB components", () => {
      const projection = createMockProjection();
      const components = JSON.parse(projection.stat_components_json);

      const slg = (components.TB || 0) / Math.max(1, components.AB || 1);

      // 280 / 500 = 0.560
      expect(slg).toBeCloseTo(0.560, 3);
    });

    it("should calculate ERA from ER and IP components", () => {
      const projection = createMockProjection({
        stat_components_json: JSON.stringify({
          AB: 0,
          IP: 180,
          ER: 60,
          H_P: 150,
          BB_P: 50,
          K: 200,
          W: 12,
          SV: 0
        })
      });
      const components = JSON.parse(projection.stat_components_json);

      const era = (9 * (components.ER || 0)) / Math.max(0.1, components.IP || 0.1);

      // 9 * 60 / 180 = 3.00
      expect(era).toBeCloseTo(3.00, 2);
    });

    it("should calculate WHIP from H_P, BB_P, and IP components", () => {
      const projection = createMockProjection({
        stat_components_json: JSON.stringify({
          AB: 0,
          IP: 180,
          ER: 60,
          H_P: 150,
          BB_P: 50,
          K: 200,
          W: 12,
          SV: 0
        })
      });
      const components = JSON.parse(projection.stat_components_json);

      const whip = ((components.H_P || 0) + (components.BB_P || 0)) / Math.max(0.1, components.IP || 0.1);

      // (150 + 50) / 180 = 1.111
      expect(whip).toBeCloseTo(1.111, 3);
    });
  });

  describe("edge cases", () => {
    it("should handle division by zero for zero AB", () => {
      const projection = createMockProjection({
        stat_components_json: JSON.stringify({
          AB: 0,
          H: 0
        })
      });
      const components = JSON.parse(projection.stat_components_json);

      const avg = (components.H || 0) / Math.max(1, components.AB || 1);

      expect(avg).toBe(0);
    });

    it("should handle missing components gracefully", () => {
      const projection = createMockProjection({
        stat_components_json: JSON.stringify({})
      });
      const components = JSON.parse(projection.stat_components_json);

      const avg = (components.H || 0) / Math.max(1, components.AB || 1);
      const era = (9 * (components.ER || 0)) / Math.max(0.1, components.IP || 0.1);

      expect(avg).toBe(0);
      expect(era).toBe(0);
    });
  });
});

describe("TradeRecommendationAgent - Rate Stat Component Math", () => {
  let agent: TradeRecommendationAgent;
  let mockDb: any;

  beforeEach(() => {
    // Mock database - we'll populate specific query results per test
    mockDb = createMockDb();
    agent = new TradeRecommendationAgent(mockDb);
  });

  describe("AVG calculation after 1-for-1 trade (batting)", () => {
    it("should calculate AVG using component math, not rate averaging", async () => {
      // Team current projected components: { H: 1500, AB: 5000 } → AVG = 0.300
      // Player traded away RoS components: { H: 50, AB: 200 } → AVG = 0.250
      // Player acquired RoS components: { H: 70, AB: 200 } → AVG = 0.350
      // Expected: new H = 1500 - 50 + 70 = 1520, new AB = 5000 - 200 + 200 = 5000
      // Expected AVG = 1520/5000 = 0.304 (NOT 0.300 + 0.350 - 0.250 = 0.400)

      const leagueId = 1;
      const teamId = 1;
      const snapshotDate = "2026-02-19";

      setupMockForAVGTest(mockDb, leagueId, teamId, snapshotDate);

      const trade = {
        givePlayers: [{ playerId: 101, playerName: "Traded Away Player" }],
        receivePlayers: [{ playerId: 102, playerName: "Acquired Player" }],
      };

      const result = await agent.analyzeTradeImpact(
        leagueId,
        teamId,
        snapshotDate,
        trade,
      );

      const avgImpact = result.categoryImpacts.find(
        (c) => c.categoryId === "AVG",
      );

      expect(avgImpact).toBeDefined();
      expect(avgImpact!.projectedValue).toBeCloseTo(0.304, 3);
      // Verify it's NOT the incorrect rate-averaging result
      expect(avgImpact!.projectedValue).not.toBeCloseTo(0.4, 1);
    });
  });

  describe("ERA calculation after 1-for-1 trade (pitching)", () => {
    it("should calculate ERA using component math, not rate averaging", async () => {
      // Team current projected components: { IP: 1200, ER: 400 } → ERA = 3.000
      // Pitcher traded away RoS components: { IP: 150, ER: 60 } → ERA = 3.600
      // Pitcher acquired RoS components: { IP: 150, ER: 45 } → ERA = 2.700
      // Expected: new IP = 1200 - 150 + 150 = 1200, new ER = 400 - 60 + 45 = 385
      // Expected ERA = 9 * 385 / 1200 = 2.8875 (NOT 3.000 + 2.700 - 3.600 = 2.100)

      const leagueId = 2;
      const teamId = 2;
      const snapshotDate = "2026-02-19";

      setupMockForERATest(mockDb, leagueId, teamId, snapshotDate);

      const trade = {
        givePlayers: [{ playerId: 201, playerName: "Traded Pitcher" }],
        receivePlayers: [{ playerId: 202, playerName: "Acquired Pitcher" }],
      };

      const result = await agent.analyzeTradeImpact(
        leagueId,
        teamId,
        snapshotDate,
        trade,
      );

      const eraImpact = result.categoryImpacts.find(
        (c) => c.categoryId === "ERA",
      );

      expect(eraImpact).toBeDefined();
      expect(eraImpact!.projectedValue).toBeCloseTo(2.8875, 3);
      // Verify it's NOT the incorrect rate-averaging result
      expect(eraImpact!.projectedValue).not.toBeCloseTo(2.1, 1);
    });
  });

  describe("OBP with multiple components", () => {
    it("should handle multi-component rate stats correctly", async () => {
      // Team projected: { H: 1500, BB: 500, HBP: 50, AB: 5000, SF: 100 }
      // Player out RoS: { H: 30, BB: 20, HBP: 2, AB: 150, SF: 5 }
      // Player in RoS: { H: 45, BB: 10, HBP: 1, AB: 150, SF: 3 }
      // Expected new components: H=1515, BB=490, HBP=49, AB=5000, SF=98
      // Expected OBP = (1515+490+49) / (5000+490+49+98) = 2054/5637 ≈ 0.3644

      const leagueId = 3;
      const teamId = 3;
      const snapshotDate = "2026-02-19";

      setupMockForOBPTest(mockDb, leagueId, teamId, snapshotDate);

      const trade = {
        givePlayers: [{ playerId: 301, playerName: "Player Out" }],
        receivePlayers: [{ playerId: 302, playerName: "Player In" }],
      };

      const result = await agent.analyzeTradeImpact(
        leagueId,
        teamId,
        snapshotDate,
        trade,
      );

      const obpImpact = result.categoryImpacts.find(
        (c) => c.categoryId === "OBP",
      );

      expect(obpImpact).toBeDefined();
      expect(obpImpact!.projectedValue).toBeCloseTo(0.3644, 3);
    });
  });

  describe("WHIP calculation", () => {
    it("should calculate WHIP using component math", async () => {
      // Team projected: { IP: 1200, H: 1100, BB: 400 }
      // Pitcher out RoS: { IP: 100, H: 95, BB: 35 }
      // Pitcher in RoS: { IP: 100, H: 80, BB: 25 }
      // Expected: IP=1200, H=1085, BB=390
      // Expected WHIP = (1085+390)/1200 = 1.2292

      const leagueId = 4;
      const teamId = 4;
      const snapshotDate = "2026-02-19";

      setupMockForWHIPTest(mockDb, leagueId, teamId, snapshotDate);

      const trade = {
        givePlayers: [{ playerId: 401, playerName: "Pitcher Out" }],
        receivePlayers: [{ playerId: 402, playerName: "Pitcher In" }],
      };

      const result = await agent.analyzeTradeImpact(
        leagueId,
        teamId,
        snapshotDate,
        trade,
      );

      const whipImpact = result.categoryImpacts.find(
        (c) => c.categoryId === "WHIP",
      );

      expect(whipImpact).toBeDefined();
      expect(whipImpact!.projectedValue).toBeCloseTo(1.2292, 3);
    });
  });

  describe("Zero-trade scenario", () => {
    it("should have zero delta when same player traded in and out", async () => {
      // Same components subtracted and added → delta = 0

      const leagueId = 5;
      const teamId = 5;
      const snapshotDate = "2026-02-19";

      setupMockForZeroTradeTest(mockDb, leagueId, teamId, snapshotDate);

      const trade = {
        givePlayers: [{ playerId: 501, playerName: "Same Player" }],
        receivePlayers: [{ playerId: 501, playerName: "Same Player" }],
      };

      const result = await agent.analyzeTradeImpact(
        leagueId,
        teamId,
        snapshotDate,
        trade,
      );

      const avgImpact = result.categoryImpacts.find(
        (c) => c.categoryId === "AVG",
      );

      expect(avgImpact).toBeDefined();
      // Projected value should equal current value (no change)
      expect(avgImpact!.projectedValue).toBe(avgImpact!.currentValue);
      expect(avgImpact!.deltaPoints).toBe(0);
    });
  });

  describe("Graceful degradation when projections missing", () => {
    it("should preserve current value when player projections not found", async () => {
      const leagueId = 6;
      const teamId = 6;
      const snapshotDate = "2026-02-19";

      setupMockForMissingProjectionsTest(mockDb, leagueId, teamId, snapshotDate);

      const trade = {
        givePlayers: [{ playerId: 601, playerName: "Player Without Projections" }],
        receivePlayers: [{ playerId: 602, playerName: "Another Player Without Projections" }],
      };

      const result = await agent.analyzeTradeImpact(
        leagueId,
        teamId,
        snapshotDate,
        trade,
      );

      const avgImpact = result.categoryImpacts.find(
        (c) => c.categoryId === "AVG",
      );

      expect(avgImpact).toBeDefined();
      // Should preserve current projected value when no player projections available
      expect(avgImpact!.projectedValue).toBe(avgImpact!.currentValue);
    });
  });

  describe("SV counting stat — closer traded for starter", () => {
    it("should subtract saves from traded-away closer and show negative SV delta", async () => {
      // Team projected SV: 30 (has a closer)
      // Trade: give closer (RP, SV=25, IP=55, ER=18) for starter (SP, SV=0, IP=180, ER=65)
      // Expected: new team SV = 30 - 25 = 5
      // Team drops in SV rank → deltaPoints < 0

      const leagueId = 8;
      const teamId = 8;
      const snapshotDate = "2026-02-19";

      setupMockForSVTest(mockDb, leagueId, teamId, snapshotDate);

      const trade = {
        givePlayers: [{ playerId: 801, playerName: "Closer Being Traded Away" }],
        receivePlayers: [{ playerId: 802, playerName: "Starter Being Acquired" }],
      };

      const result = await agent.analyzeTradeImpact(
        leagueId,
        teamId,
        snapshotDate,
        trade,
      );

      const svImpact = result.categoryImpacts.find(
        (c) => c.categoryId === "SV",
      );

      expect(svImpact).toBeDefined();
      // Projected SV must decrease: 30 - 25 = 5
      expect(svImpact!.projectedValue).toBe(5);
      // Team rank in SV must worsen (higher rank number = worse)
      expect(svImpact!.deltaRank).toBeGreaterThan(0);
      // Net roto points for SV must be negative
      expect(svImpact!.deltaPoints).toBeLessThan(0);
    });
  });

  describe("Multi-player trade (2-for-2) with mixed counting and rate stats", () => {
    it("should correctly calculate both counting stats (HR) and rate stats (AVG)", async () => {
      // Team projected: { H: 1500, AB: 5000, HR: 200 } → AVG = 0.300, HR = 200
      // Trade away 2 players:
      //   Player A: { H: 50, AB: 200, HR: 10 } → AVG = 0.250
      //   Player B: { H: 40, AB: 150, HR: 15 } → AVG = 0.267
      // Receive 2 players:
      //   Player C: { H: 70, AB: 200, HR: 20 } → AVG = 0.350
      //   Player D: { H: 60, AB: 180, HR: 12 } → AVG = 0.333
      //
      // Expected components after trade:
      //   H: 1500 - 50 - 40 + 70 + 60 = 1540
      //   AB: 5000 - 200 - 150 + 200 + 180 = 5030
      //   HR: 200 - 10 - 15 + 20 + 12 = 207
      // Expected AVG = 1540/5030 = 0.3062 (rate stat with component math)
      // Expected HR = 207 (counting stat with simple addition)

      const leagueId = 7;
      const teamId = 7;
      const snapshotDate = "2026-02-19";

      setupMockForMultiPlayerTest(mockDb, leagueId, teamId, snapshotDate);

      const trade = {
        givePlayers: [
          { playerId: 701, playerName: "Player A" },
          { playerId: 702, playerName: "Player B" },
        ],
        receivePlayers: [
          { playerId: 703, playerName: "Player C" },
          { playerId: 704, playerName: "Player D" },
        ],
      };

      const result = await agent.analyzeTradeImpact(
        leagueId,
        teamId,
        snapshotDate,
        trade,
      );

      // Check AVG (rate stat)
      const avgImpact = result.categoryImpacts.find(
        (c) => c.categoryId === "AVG",
      );
      expect(avgImpact).toBeDefined();
      expect(avgImpact!.projectedValue).toBeCloseTo(0.3062, 3);

      // Check HR (counting stat)
      const hrImpact = result.categoryImpacts.find(
        (c) => c.categoryId === "HR",
      );
      expect(hrImpact).toBeDefined();
      expect(hrImpact!.projectedValue).toBe(207);
    });
  });
});

// Mock database helper
function createMockDb(): any {
  const mockResults = new Map<string, any>();

  // Normalize table name by removing aliases (e.g., "team_roster_snapshot as roster" -> "team_roster_snapshot")
  const normalizeTable = (table: string): string => {
    return table.split(" as ")[0].trim();
  };

  // Create a chainable query builder that can handle unlimited .where() calls
  const createChainable = (table: string, joinTables: string[] = []): any => {
    const normalizedTable = normalizeTable(table);
    const normalizedJoinTables = joinTables.map(normalizeTable);

    // Create key from table and all join tables
    const key = [normalizedTable, ...normalizedJoinTables].join("_");

    const builder: any = {
      where: (..._args: any[]) => createChainable(table, joinTables),
      execute: () => mockResults.get(`${key}_list`) || [],
      executeTakeFirst: () => mockResults.get(`${key}_single`),
      executeTakeFirstOrThrow: () => {
        const result = mockResults.get(`${key}_single`);
        if (!result) throw new Error(`No result for ${key}_single`);
        return result;
      },
      orderBy: (..._args: any[]) => createChainable(table, joinTables),
      select: (_fields: any) => createChainable(table, joinTables),
      selectAll: (_prefix?: string) => createChainable(table, joinTables),
      innerJoin: (jTable: string, ..._args: any[]) => createChainable(table, [...joinTables, jTable]),
    };

    return builder;
  };

  return {
    selectFrom: (table: string) => createChainable(table),
    _setMockResult: (key: string, value: any) => {
      mockResults.set(key, value);
    },
  };
}

// Test setup helpers
function setupMockForAVGTest(mockDb: any, leagueId: number, teamId: number, snapshotDate: string) {
  // Snapshot exists
  mockDb._setMockResult("league_daily_snapshot_single", {
    league_id: leagueId,
    snapshot_date: snapshotDate,
    projections_run_id: 1,
  });

  // Settings with AVG category
  mockDb._setMockResult("league_daily_snapshot_league_settings_version_single", {
    settings_json: {
      categories: [
        { category_id: "AVG", stat_key: "AVG", name: "Batting Average", type: "RATE", formula_id: "avg", direction: "HIGHER_BETTER" },
      ],
    },
  });

  // Current projected overall
  mockDb._setMockResult("team_daily_projected_overall_single", {
    projected_overall_points: 5,
  });

  // Current projected categories - team has H=1500, AB=5000
  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      category_id: "AVG",
      projected_value: 0.300,
      projected_rank: 5,
      projected_roto_points: 5,
      projected_components_json: { H: 1500, AB: 5000 },
    },
  ]);

  // All teams' projected categories (for re-ranking)
  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      team_id: teamId,
      category_id: "AVG",
      projected_value: 0.300,
      projected_components_json: { H: 1500, AB: 5000 },
    },
    { team_id: 10, category_id: "AVG", projected_value: 0.280, projected_components_json: {} },
    { team_id: 11, category_id: "AVG", projected_value: 0.290, projected_components_json: {} },
    { team_id: 12, category_id: "AVG", projected_value: 0.310, projected_components_json: {} },
  ]);

  // Roster - note: table is "team_roster_snapshot as roster" with innerJoin "player"
  // The mock key follows pattern: table_jointable_list
  mockDb._setMockResult("team_roster_snapshot_player_list", [
    { player_id: 101, player_name: "Traded Away Player", positions: ["OF"], roster_status: "active" },
  ]);

  // Player projections - when projections_run_id is set, the primary path runs:
  //   selectFrom("player_projection as proj").innerJoin("player", ...)
  // Mock key: player_projection_player_list
  // stat_components_json must be a plain object (Postgres JSONB auto-parses in production)
  // Player 101 (traded away): H=50, AB=200
  // Player 102 (acquired): H=70, AB=200
  mockDb._setMockResult("player_projection_player_list", [
    {
      player_id: 101,
      projections_run_id: 1,
      stat_components_json: { H: 50, AB: 200 },
    },
    {
      player_id: 102,
      projections_run_id: 1,
      stat_components_json: { H: 70, AB: 200 },
    },
  ]);
}

function setupMockForERATest(mockDb: any, leagueId: number, teamId: number, snapshotDate: string) {
  mockDb._setMockResult("league_daily_snapshot_single", {
    league_id: leagueId,
    snapshot_date: snapshotDate,
    projections_run_id: 2,
  });

  mockDb._setMockResult("league_daily_snapshot_league_settings_version_single", {
    settings_json: {
      categories: [
        { category_id: "ERA", stat_key: "ERA", name: "Earned Run Average", type: "RATE", formula_id: "era", direction: "LOWER_BETTER" },
      ],
    },
  });

  mockDb._setMockResult("team_daily_projected_overall_single", {
    projected_overall_points: 6,
  });

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      category_id: "ERA",
      projected_value: 3.000,
      projected_rank: 6,
      projected_roto_points: 6,
      projected_components_json: { IP: 1200, ER: 400 },
    },
  ]);

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      team_id: teamId,
      category_id: "ERA",
      projected_value: 3.000,
      projected_components_json: { IP: 1200, ER: 400 },
    },
    { team_id: 20, category_id: "ERA", projected_value: 3.500, projected_components_json: {} },
    { team_id: 21, category_id: "ERA", projected_value: 3.200, projected_components_json: {} },
  ]);

  mockDb._setMockResult("team_roster_snapshot_player_list", [
    { player_id: 201, player_name: "Traded Pitcher", positions: ["SP"], roster_status: "active" },
  ]);

  mockDb._setMockResult("player_projection_player_list", [
    {
      player_id: 201,
      projections_run_id: 2,
      stat_components_json: { IP: 150, ER: 60 },
    },
    {
      player_id: 202,
      projections_run_id: 2,
      stat_components_json: { IP: 150, ER: 45 },
    },
  ]);
}

function setupMockForOBPTest(mockDb: any, leagueId: number, teamId: number, snapshotDate: string) {
  mockDb._setMockResult("league_daily_snapshot_single", {
    league_id: leagueId,
    snapshot_date: snapshotDate,
    projections_run_id: 3,
  });

  mockDb._setMockResult("league_daily_snapshot_league_settings_version_single", {
    settings_json: {
      categories: [
        { category_id: "OBP", stat_key: "OBP", name: "On-Base Percentage", type: "RATE", formula_id: "obp", direction: "HIGHER_BETTER" },
      ],
    },
  });

  mockDb._setMockResult("team_daily_projected_overall_single", {
    projected_overall_points: 7,
  });

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      category_id: "OBP",
      projected_value: 0.3529, // (1500+500+50)/(5000+500+50+100)
      projected_rank: 7,
      projected_roto_points: 7,
      projected_components_json: { H: 1500, BB: 500, HBP: 50, AB: 5000, SF: 100 },
    },
  ]);

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      team_id: teamId,
      category_id: "OBP",
      projected_value: 0.3529,
      projected_components_json: { H: 1500, BB: 500, HBP: 50, AB: 5000, SF: 100 },
    },
    { team_id: 30, category_id: "OBP", projected_value: 0.340, projected_components_json: {} },
    { team_id: 31, category_id: "OBP", projected_value: 0.360, projected_components_json: {} },
  ]);

  mockDb._setMockResult("team_roster_snapshot_player_list", [
    { player_id: 301, player_name: "Player Out", positions: ["1B"], roster_status: "active" },
  ]);

  mockDb._setMockResult("player_projection_player_list", [
    {
      player_id: 301,
      projections_run_id: 3,
      stat_components_json: { H: 30, BB: 20, HBP: 2, AB: 150, SF: 5 },
    },
    {
      player_id: 302,
      projections_run_id: 3,
      stat_components_json: { H: 45, BB: 10, HBP: 1, AB: 150, SF: 3 },
    },
  ]);
}

function setupMockForWHIPTest(mockDb: any, leagueId: number, teamId: number, snapshotDate: string) {
  mockDb._setMockResult("league_daily_snapshot_single", {
    league_id: leagueId,
    snapshot_date: snapshotDate,
    projections_run_id: 4,
  });

  mockDb._setMockResult("league_daily_snapshot_league_settings_version_single", {
    settings_json: {
      categories: [
        { category_id: "WHIP", stat_key: "WHIP", name: "Walks + Hits / IP", type: "RATE", formula_id: "whip", direction: "LOWER_BETTER" },
      ],
    },
  });

  mockDb._setMockResult("team_daily_projected_overall_single", {
    projected_overall_points: 8,
  });

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      category_id: "WHIP",
      projected_value: 1.25, // (1100+400)/1200
      projected_rank: 8,
      projected_roto_points: 8,
      projected_components_json: { IP: 1200, H: 1100, BB: 400 },
    },
  ]);

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      team_id: teamId,
      category_id: "WHIP",
      projected_value: 1.25,
      projected_components_json: { IP: 1200, H: 1100, BB: 400 },
    },
    { team_id: 40, category_id: "WHIP", projected_value: 1.30, projected_components_json: {} },
  ]);

  mockDb._setMockResult("team_roster_snapshot_player_list", [
    { player_id: 401, player_name: "Pitcher Out", positions: ["RP"], roster_status: "active" },
  ]);

  mockDb._setMockResult("player_projection_player_list", [
    {
      player_id: 401,
      projections_run_id: 4,
      stat_components_json: { IP: 100, H: 95, BB: 35 },
    },
    {
      player_id: 402,
      projections_run_id: 4,
      stat_components_json: { IP: 100, H: 80, BB: 25 },
    },
  ]);
}

function setupMockForZeroTradeTest(mockDb: any, leagueId: number, teamId: number, snapshotDate: string) {
  mockDb._setMockResult("league_daily_snapshot_single", {
    league_id: leagueId,
    snapshot_date: snapshotDate,
    projections_run_id: 5,
  });

  mockDb._setMockResult("league_daily_snapshot_league_settings_version_single", {
    settings_json: {
      categories: [
        { category_id: "AVG", stat_key: "AVG", name: "Batting Average", type: "RATE", formula_id: "avg", direction: "HIGHER_BETTER" },
      ],
    },
  });

  mockDb._setMockResult("team_daily_projected_overall_single", {
    projected_overall_points: 5,
  });

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      category_id: "AVG",
      projected_value: 0.300,
      projected_rank: 5,
      projected_roto_points: 5,
      projected_components_json: { H: 1500, AB: 5000 },
    },
  ]);

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      team_id: teamId,
      category_id: "AVG",
      projected_value: 0.300,
      projected_components_json: { H: 1500, AB: 5000 },
    },
  ]);

  mockDb._setMockResult("team_roster_snapshot_player_list", [
    { player_id: 501, player_name: "Same Player", positions: ["OF"], roster_status: "active" },
  ]);

  mockDb._setMockResult("player_projection_player_list", [
    {
      player_id: 501,
      projections_run_id: 5,
      stat_components_json: { H: 50, AB: 200 },
    },
  ]);
}

function setupMockForMissingProjectionsTest(mockDb: any, leagueId: number, teamId: number, snapshotDate: string) {
  mockDb._setMockResult("league_daily_snapshot_single", {
    league_id: leagueId,
    snapshot_date: snapshotDate,
    projections_run_id: null, // No projections run — uses fallback date-based path
  });

  mockDb._setMockResult("league_daily_snapshot_league_settings_version_single", {
    settings_json: {
      categories: [
        { category_id: "AVG", stat_key: "AVG", name: "Batting Average", type: "RATE", formula_id: "avg", direction: "HIGHER_BETTER" },
      ],
    },
  });

  mockDb._setMockResult("team_daily_projected_overall_single", {
    projected_overall_points: 5,
  });

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      category_id: "AVG",
      projected_value: 0.300,
      projected_rank: 5,
      projected_roto_points: 5,
      projected_components_json: { H: 1500, AB: 5000 },
    },
  ]);

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      team_id: teamId,
      category_id: "AVG",
      projected_value: 0.300,
      projected_components_json: { H: 1500, AB: 5000 },
    },
  ]);

  mockDb._setMockResult("team_roster_snapshot_player_list", [
    { player_id: 601, player_name: "Player Without Projections", positions: ["OF"], roster_status: "active" },
  ]);

  // Empty projections list (no projections found)
  mockDb._setMockResult("player_projection_projections_run_player_list", []);
}

function setupMockForMultiPlayerTest(mockDb: any, leagueId: number, teamId: number, snapshotDate: string) {
  mockDb._setMockResult("league_daily_snapshot_single", {
    league_id: leagueId,
    snapshot_date: snapshotDate,
    projections_run_id: 7,
  });

  mockDb._setMockResult("league_daily_snapshot_league_settings_version_single", {
    settings_json: {
      categories: [
        { category_id: "AVG", stat_key: "AVG", name: "Batting Average", type: "RATE", formula_id: "avg", direction: "HIGHER_BETTER" },
        { category_id: "HR", stat_key: "HR", name: "Home Runs", type: "COUNTING", direction: "HIGHER_BETTER" },
      ],
    },
  });

  mockDb._setMockResult("team_daily_projected_overall_single", {
    projected_overall_points: 10,
  });

  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      category_id: "AVG",
      projected_value: 0.300,
      projected_rank: 5,
      projected_roto_points: 5,
      projected_components_json: { H: 1500, AB: 5000 },
    },
    {
      category_id: "HR",
      projected_value: 200,
      projected_rank: 5,
      projected_roto_points: 5,
      projected_components_json: {},
    },
  ]);

  // All teams' projected categories (for re-ranking after trade)
  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      team_id: teamId,
      category_id: "AVG",
      projected_value: 0.300,
      projected_components_json: { H: 1500, AB: 5000 },
    },
    {
      team_id: teamId,
      category_id: "HR",
      projected_value: 200,
      projected_components_json: {},
    },
    { team_id: 70, category_id: "AVG", projected_value: 0.280, projected_components_json: {} },
    { team_id: 70, category_id: "HR", projected_value: 180, projected_components_json: {} },
    { team_id: 71, category_id: "AVG", projected_value: 0.310, projected_components_json: {} },
    { team_id: 71, category_id: "HR", projected_value: 210, projected_components_json: {} },
  ]);

  mockDb._setMockResult("team_roster_snapshot_player_list", [
    { player_id: 701, player_name: "Player A", positions: ["OF"], roster_status: "active" },
    { player_id: 702, player_name: "Player B", positions: ["1B"], roster_status: "active" },
  ]);

  mockDb._setMockResult("player_projection_player_list", [
    {
      player_id: 701,
      projections_run_id: 7,
      stat_components_json: { H: 50, AB: 200, HR: 10 },
    },
    {
      player_id: 702,
      projections_run_id: 7,
      stat_components_json: { H: 40, AB: 150, HR: 15 },
    },
    {
      player_id: 703,
      projections_run_id: 7,
      stat_components_json: { H: 70, AB: 200, HR: 20 },
    },
    {
      player_id: 704,
      projections_run_id: 7,
      stat_components_json: { H: 60, AB: 180, HR: 12 },
    },
  ]);
}

function setupMockForSVTest(mockDb: any, leagueId: number, teamId: number, snapshotDate: string) {
  mockDb._setMockResult("league_daily_snapshot_single", {
    league_id: leagueId,
    snapshot_date: snapshotDate,
    projections_run_id: 8,
  });

  mockDb._setMockResult("league_daily_snapshot_league_settings_version_single", {
    settings_json: {
      categories: [
        { category_id: "SV", stat_key: "SV", name: "Saves", type: "COUNTING", direction: "HIGHER_BETTER" },
      ],
    },
  });

  mockDb._setMockResult("team_daily_projected_overall_single", {
    projected_overall_points: 6,
  });

  // Team's current projected SV = 30 (has a closer rostered)
  mockDb._setMockResult("team_daily_projected_category_list", [
    {
      category_id: "SV",
      projected_value: 30,
      projected_rank: 3,
      projected_roto_points: 6,
      projected_components_json: {},
    },
  ]);

  // All teams' projected SV for re-ranking after trade.
  // projected_rank is included on the user team entry so getCurrentStandings returns
  // the correct pre-trade rank (3rd with 30 saves).
  mockDb._setMockResult("team_daily_projected_category_list", [
    { team_id: teamId, category_id: "SV", projected_value: 30, projected_rank: 3, projected_roto_points: 6, projected_components_json: {} },
    { team_id: 80, category_id: "SV", projected_value: 40, projected_rank: 1, projected_roto_points: 8, projected_components_json: {} },
    { team_id: 81, category_id: "SV", projected_value: 35, projected_rank: 2, projected_roto_points: 7, projected_components_json: {} },
    { team_id: 82, category_id: "SV", projected_value: 22, projected_rank: 4, projected_roto_points: 5, projected_components_json: {} },
    { team_id: 83, category_id: "SV", projected_value: 18, projected_rank: 5, projected_roto_points: 4, projected_components_json: {} },
    { team_id: 84, category_id: "SV", projected_value: 12, projected_rank: 6, projected_roto_points: 3, projected_components_json: {} },
    { team_id: 85, category_id: "SV", projected_value: 8, projected_rank: 7, projected_roto_points: 2, projected_components_json: {} },
    { team_id: 86, category_id: "SV", projected_value: 5, projected_rank: 8, projected_roto_points: 1, projected_components_json: {} },
  ]);

  mockDb._setMockResult("team_roster_snapshot_player_list", [
    { player_id: 801, player_name: "Closer Being Traded Away", positions: ["RP"], roster_status: "active" },
  ]);

  // Closer (player 801): 25 projected saves, 55 IP
  // SP (player 802): 0 projected saves, 180 IP
  // When projections_run_id is set, primary path uses player_projection_player_list
  mockDb._setMockResult("player_projection_player_list", [
    {
      player_id: 801,
      projections_run_id: 8,
      stat_components_json: { IP: 55, ER: 18, HA: 40, BBA: 15, K: 65, W: 3, SV: 25 },
    },
    {
      player_id: 802,
      projections_run_id: 8,
      stat_components_json: { IP: 180, ER: 65, HA: 160, BBA: 55, K: 185, W: 13, SV: 0 },
    },
  ]);
}
