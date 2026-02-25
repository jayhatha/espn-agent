import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type {
  AuctionValue,
  DraftConfiguration,
} from "../../../shared/dist/index.js";
import {
  calculateSpendingPool,
  calculateAuctionDollarValue,
} from "../../../shared/dist/index.js";
import { DraftRankingsAgent } from "./draft-rankings.js";

/**
 * Auction Valuation Agent
 * Per AGENTS.md §6
 *
 * Converts VBD to dollar values with budget constraints
 */

export class AuctionValuationAgent {
  constructor(
    private db: Kysely<Database>,
    private draftRankingsAgent: DraftRankingsAgent,
    private logger?: Logger,
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

    const settings = latestSettings.settings_json as any;
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
      budget: options?.budget,
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

    // Calculate total roster size
    const rosterSize = Object.values(config.rosterSlots).reduce(
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

    // Calculate total positive VBD
    const totalVBD = rankings.reduce((sum, r) => sum + r.vbdScore, 0);

    // DIAGNOSTIC: Log intermediate calculations for debugging
    this.logger?.info(
      {
        totalTeams,
        rosterSize,
        budget,
        minBid,
        spendingPool,
        totalVBD,
        playersAboveReplacement: rankings.filter((r) => r.vbdScore > 0).length,
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
            sgpTotal: r.sgpTotal.toFixed(2),
            vbdScore: r.vbdScore.toFixed(2),
          })),
        },
        "Top 10 players by VBD",
      );
    }

    // Convert VBD to dollar values
    const valuations: AuctionValue[] = rankings.map((ranking) => {
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
      };
    });

    // Sort by dollar value descending
    valuations.sort((a, b) => b.dollarValue - a.dollarValue);

    // AUDIT FIX: Validate budget sum for top rostered players
    const rosteredCount = totalTeams * rosterSize;
    const topRosteredPlayers = valuations.slice(0, rosteredCount);
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
        v.positions.includes(position),
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
            vbdScore: v.vbdScore.toFixed(2),
            sgpTotal: v.sgpTotal.toFixed(2),
          })),
        },
        "Top 10 players by dollar value",
      );
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
