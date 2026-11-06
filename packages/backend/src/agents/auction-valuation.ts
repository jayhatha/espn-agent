import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type {
  AuctionValue,
  DraftConfiguration,
  StatComponents,
} from "../../../shared/dist/index.js";
import {
  calculateSpendingPool,
  calculateAuctionDollarValue,
} from "../../../shared/dist/index.js";
import { DraftRankingsAgent } from "./draft-rankings.js";
import {
  getDraftableRosterSlots,
  selectRosterFeasiblePlayers,
} from "./draft-value-model.js";

/**
 * Auction Valuation Agent
 * Per AGENTS.md §6
 *
 * Converts VBD to dollar values with budget constraints
 *
 * Methodology:
 * 1. Calculate SGP (Standings Gain Points) for all players across all categories
 * 2. Calculate position-specific replacement levels (Nth player at each position where N = teams * slots)
 * 3. Calculate VBD = player SGP - replacement SGP for their most valuable eligible position
 * 4. Allocate budget proportionally: dollarValue = (playerVBD / totalVBD) * spendingPool + minBid
 *
 * Key implementation details:
 * - Only rostered players (top N = teams * rosterSize) are used for totalVBD denominator
 * - This prevents dilution from many fringe free agents with small positive VBD
 * - Position scarcity is captured via replacement levels (C/RP scarce → high replacement SGP → lower VBD for all but elite)
 * - Rate stats (AVG, ERA, WHIP) calculated from components before SGP conversion
 * - Sparse positions (fewer eligible players than roster slots) use -10 replacement SGP (all players valuable)
 *
 * Industry alignment:
 * - VBD/SGP approach aligns with standard fantasy baseball valuation methods (similar to z-scores)
 * - For 12-team $260 leagues, expect top player ~$40-55 and top 5 average ~$40-55
 * - Position scarcity premiums reflect typical MLB player pools (catchers and closers scarce, outfielders plentiful)
 * - Budget validation ensures rostered players sum to total league budget (within 5% tolerance)
 */

export class AuctionValuationAgent {
  constructor(
    private db: Kysely<Database>,
    private draftRankingsAgent: DraftRankingsAgent,
    private logger?: BaseLogger,
  ) {}

  /**
   * Get auction valuations using VBD-based dollar allocation
   */
  async getValuations(
    leagueId: number,
    options?: {
      projectionsRunId?: number;
      budget?: number; // Default 260
      minBid?: number; // Default 1
      limit?: number; // Default 300
      position?: string;
    },
  ): Promise<AuctionValue[]> {
    this.logger?.info({ leagueId }, "Fetching league config from DB");

    // Get league settings from DB
    const latestSettings = await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    if (!latestSettings) {
      this.logger?.warn({ leagueId }, "No league settings found");
      return [];
    }

    const settings = latestSettings.settings_json;
    const categories = settings.categories;
    const rosterSlots = settings.roster_slots as Record<string, number>;

    // Get total teams
    const teams = await this.db
      .selectFrom("team")
      .select("id")
      .where("league_id", "=", leagueId)
      .execute();

    const config: DraftConfiguration = {
      categories,
      rosterSlots,
      totalTeams: teams.length,
      budget: options?.budget || 260,
      minBid: options?.minBid,
    };

    // Delegate to config-based method
    return this.getValuationsWithConfig(config, options);
  }

  /**
   * Get auction valuations with provided configuration
   * (League-agnostic version)
   */
  async getValuationsWithConfig(
    config: DraftConfiguration,
    options?: {
      projectionsRunId?: number;
      budget?: number;
      minBid?: number;
      limit?: number;
      position?: string;
    },
  ): Promise<AuctionValue[]> {
    const budget = options?.budget || config.budget || 260;
    const minBid = options?.minBid || config.minBid || 1;
    const limit = options?.limit || 300;
    const { position, projectionsRunId } = options || {};

    this.logger?.info(
      { totalTeams: config.totalTeams, budget, minBid, limit, position },
      "Generating auction valuations with config",
    );

    // Get VBD rankings using config (use higher limit to ensure we have full pool)
    const rankings = await this.draftRankingsAgent.getRankingsWithConfig(
      config,
      {
        projectionsRunId,
        limit: 500,
      },
    );

    if (rankings.length === 0) {
      this.logger?.warn("No rankings available for valuation");
      return [];
    }

    const draftableRosterSlots = getDraftableRosterSlots(config.rosterSlots);
    const rosterSize = Object.values(draftableRosterSlots).reduce(
      (sum, count) => sum + (count as number),
      0,
    );

    const totalTeams = config.totalTeams;

    // Calculate spending pool
    const spendingPool = calculateSpendingPool(
      budget,
      totalTeams,
      rosterSize,
      minBid,
    );

    const rosteredCount = totalTeams * rosterSize;
    const feasiblePlayers = selectRosterFeasiblePlayers(
      rankings.map((ranking) => ({
        playerId: ranking.playerId,
        positions: ranking.positions as string[],
        projectedStats: ranking.projectedStats as StatComponents,
        ranking,
      })),
      draftableRosterSlots,
      totalTeams,
      (player) => Number(player.ranking.vbdScore ?? 0),
    );
    const rosteredRankings = feasiblePlayers.map((player) => player.ranking);
    const rosteredPlayerIds = new Set(
      rosteredRankings.map((ranking) => ranking.playerId),
    );

    // Calculate total VBD from rostered players only
    const totalVBD = rosteredRankings.reduce(
      (sum, r) => ((r as any).vbdScore > 0 ? sum + (r as any).vbdScore : sum),
      0,
    );

    // DIAGNOSTIC: Log intermediate calculations for debugging
    this.logger?.info(
      {
        totalTeams,
        rosterSize,
        rosteredCount,
        budget,
        minBid,
        spendingPool,
        totalVBD,
        playersAboveReplacement: rosteredRankings.filter(
          (r) => (r as any).vbdScore > 0,
        ).length,
        totalRankings: rankings.length,
      },
      "Calculated auction parameters",
    );

    // DIAGNOSTIC: Log top 10 players with SGP/VBD breakdown
    const top10 = rankings.slice(0, 10);
    if (top10.length > 0) {
      this.logger?.info(
        {
          players: top10.map((r) => ({
            playerId: r.playerId,
            playerName: r.playerName,
            primaryPosition: r.primaryPosition,
            sgpTotal: (r as any).sgpTotal.toFixed(2),
            vbdScore: (r as any).vbdScore.toFixed(2),
          })),
        },
        "Top 10 players by VBD",
      );
    }

    // Convert VBD to dollar values for rostered players
    const rosteredValuations: AuctionValue[] = (rosteredRankings as any[]).map(
      (ranking): any => {
        let dollarValue: number;

        if (ranking.vbdScore > 0) {
          dollarValue = calculateAuctionDollarValue(
            ranking.vbdScore,
            totalVBD,
            spendingPool,
            minBid,
          );
        } else {
          // Players below replacement get minimum bid
          dollarValue = minBid;
        }

        return {
          playerId: ranking.playerId,
          playerName: ranking.playerName,
          positions: ranking.positions,
          primaryPosition: ranking.primaryPosition,
          dollarValue,
          vbdScore: ranking.vbdScore,
          sgpTotal: ranking.sgpTotal,
          projectedStats: ranking.projectedStats,
        };
      },
    );

    // Add non-rostered players at minimum bid (free agents)
    const freeAgentRankings = rankings.filter(
      (ranking) => !rosteredPlayerIds.has(ranking.playerId),
    );
    const freeAgentValuations: AuctionValue[] = (
      freeAgentRankings as any[]
    ).map((ranking): any => ({
      playerId: ranking.playerId,
      playerName: ranking.playerName,
      positions: ranking.positions,
      primaryPosition: ranking.primaryPosition,
      dollarValue: minBid,
      vbdScore: ranking.vbdScore,
      sgpTotal: ranking.sgpTotal,
      projectedStats: ranking.projectedStats,
    }));

    // Combine rostered + free agents
    const valuations = [...rosteredValuations, ...freeAgentValuations];

    // Sort by dollar value descending
    valuations.sort((a, b) => b.dollarValue - a.dollarValue);

    // AUDIT FIX: Validate budget sum for rostered players
    const topRosteredPlayers = valuations.filter((valuation) =>
      rosteredPlayerIds.has(valuation.playerId),
    );
    const totalValuation = topRosteredPlayers.reduce(
      (sum, v) => sum + v.dollarValue,
      0,
    );
    const expectedTotal = budget * totalTeams;
    const budgetDelta = Math.abs(totalValuation - expectedTotal);
    const budgetDeltaPct = expectedTotal > 0 ? budgetDelta / expectedTotal : 0;

    if (budgetDeltaPct > 0.05) {
      this.logger?.warn(
        {
          totalValuation,
          expectedTotal,
          budgetDelta,
          budgetDeltaPct: (budgetDeltaPct * 100).toFixed(1) + "%",
          rosteredCount,
        },
        "Auction valuation sum does not match expected total budget",
      );
    }

    // Filter by position if requested
    let filteredValuations = valuations;
    if (position) {
      filteredValuations = valuations.filter((v) =>
        (v as any).positions.includes(position),
      );
    }

    // Apply limit
    const result = filteredValuations.slice(0, limit);

    // DIAGNOSTIC: Log top 10 dollar values for comparison
    const top10Values = result.slice(0, 10);
    if (top10Values.length > 0) {
      this.logger?.info(
        {
          players: top10Values.map((v) => ({
            playerName: v.playerName,
            primaryPosition: v.primaryPosition,
            dollarValue: v.dollarValue,
            vbdScore: (v as any).vbdScore.toFixed(2),
            sgpTotal: (v as any).sgpTotal.toFixed(2),
          })),
        },
        "Top 10 players by dollar value",
      );
    }

    // Industry benchmark validation for standard 12-team $260 leagues
    if (totalTeams === 12 && budget === 260 && rosteredCount === 300) {
      const top5Avg =
        valuations.slice(0, 5).reduce((sum, v) => sum + v.dollarValue, 0) / 5;
      const top20Avg =
        valuations.slice(0, 20).reduce((sum, v) => sum + v.dollarValue, 0) / 20;
      const topPlayer = valuations[0]?.dollarValue || 0;

      this.logger?.info(
        {
          topPlayer,
          top5Avg: top5Avg.toFixed(1),
          top20Avg: top20Avg.toFixed(1),
          benchmarks: {
            expectedTopPlayer: "$40-55",
            expectedTop5Avg: "$40-55",
            expectedTop20Avg: "$25-45",
          },
        },
        "Industry benchmark comparison (12-team $260 league)",
      );

      // Warn if values are significantly outside expected ranges
      if (top5Avg < 35 || top5Avg > 60) {
        this.logger?.warn(
          { top5Avg: top5Avg.toFixed(1), expected: "$40-55" },
          "Top 5 average auction value outside expected industry range",
        );
      }

      if (topPlayer < 40 || topPlayer > 55) {
        this.logger?.warn(
          { topPlayer, expected: "$40-55" },
          "Top player auction value outside expected industry range - may indicate projection quality or SGP compression issues",
        );
      }
    }

    this.logger?.info(
      {
        totalValuations: valuations.length,
        filtered: filteredValuations.length,
        returned: result.length,
        topValue: result[0]?.dollarValue || 0,
        avgValue:
          result.reduce((sum, v) => sum + v.dollarValue, 0) / result.length ||
          0,
        budgetValidation: {
          totalValuation,
          expectedTotal,
          delta: budgetDelta,
          deltaPct: (budgetDeltaPct * 100).toFixed(1) + "%",
        },
      },
      "Auction valuations generated",
    );

    return result;
  }
}
