import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { AuctionValue } from "../../../shared/dist/index.js";
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
    const {
      budget = 260,
      minBid = 1,
      limit = 300,
      position,
      projectionsRunId,
    } = options || {};

    this.logger?.info(
      { leagueId, budget, minBid, limit, position },
      "Generating auction valuations",
    );

    // Get VBD rankings for all players (use higher limit to ensure we have full pool)
    const rankings = await this.draftRankingsAgent.getRankings(leagueId, {
      projectionsRunId,
      limit: 500,
    });

    if (rankings.length === 0) {
      this.logger?.warn("No rankings available for valuation");
      return [];
    }

    // Get league settings to calculate roster size
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
    const rosterSlots = settings.roster_slots as Record<string, number>;

    // Calculate total roster size
    const rosterSize = Object.values(rosterSlots).reduce(
      (sum, count) => sum + (count as number),
      0,
    );

    // Get total teams
    const teams = await this.db
      .selectFrom("team")
      .select("id")
      .where("league_id", "=", leagueId)
      .execute();

    const totalTeams = teams.length;

    // Calculate spending pool
    const spendingPool = calculateSpendingPool(
      budget,
      totalTeams,
      rosterSize,
      minBid,
    );

    // Calculate total positive VBD
    const totalVBD = rankings.reduce((sum, r) => sum + r.vbdScore, 0);

    this.logger?.info(
      {
        totalTeams,
        rosterSize,
        spendingPool,
        totalVBD,
        playersAboveReplacement: rankings.filter((r) => r.vbdScore > 0).length,
      },
      "Calculated auction parameters",
    );

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

    // Filter by position if requested
    let filteredValuations = valuations;
    if (position) {
      filteredValuations = valuations.filter((v) =>
        v.positions.includes(position),
      );
    }

    // Apply limit
    const result = filteredValuations.slice(0, limit);

    this.logger?.info(
      {
        totalValuations: valuations.length,
        filtered: filteredValuations.length,
        returned: result.length,
        topValue: result[0]?.dollarValue || 0,
        avgValue:
          result.reduce((sum, v) => sum + v.dollarValue, 0) / result.length || 0,
      },
      "Auction valuations generated",
    );

    return result;
  }
}
