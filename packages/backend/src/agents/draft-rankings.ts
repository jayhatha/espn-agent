import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type {
  Category,
  StatComponents,
  DraftRanking,
  DraftConfiguration,
} from "../../../shared/dist/index.js";
import {
  calculateTotalSGP,
  getReplacementLevel,
  calculateVBD,
  calculateFinalRate,
} from "../../../shared/dist/index.js";

/**
 * Draft Rankings Agent
 * Per AGENTS.md §6
 *
 * Produces VBD-ranked player list with position-specific replacement levels
 */

interface PlayerWithProjection {
  playerId: number;
  playerName: string;
  positions: string[];
  projectedStats: StatComponents;
  sgpTotal: number;
  categorySGPs: Record<string, number>;
}

export class DraftRankingsAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {}

  /**
   * Get draft rankings using VBD methodology
   */
  async getRankings(
    leagueId: number,
    options?: {
      projectionsRunId?: number;
      limit?: number;
      position?: string;
    },
  ): Promise<DraftRanking[]> {
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
    const categories = settings.categories as Category[];
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
    };

    // Delegate to config-based method
    return this.getRankingsWithConfig(config, options);
  }

  /**
   * Get draft rankings using VBD with provided configuration
   * (League-agnostic version)
   */
  async getRankingsWithConfig(
    config: DraftConfiguration,
    options?: {
      projectionsRunId?: number;
      limit?: number;
      position?: string;
    },
  ): Promise<DraftRanking[]> {
    const { limit = 300, position } = options || {};

    this.logger?.info(
      { totalTeams: config.totalTeams, limit, position },
      "Generating draft rankings with config",
    );

    const { categories, rosterSlots, totalTeams } = config;

    // Determine projections run ID
    let projectionsRunId = options?.projectionsRunId;
    if (!projectionsRunId) {
      const latestRun = await this.db
        .selectFrom("projections_run")
        .select("id")
        .where("staleness", "=", "fresh")
        .orderBy("as_of_date", "desc")
        .executeTakeFirst();

      if (!latestRun) {
        this.logger?.warn("No fresh projections run found");
        return [];
      }

      projectionsRunId = latestRun.id;
    }

    // Load all player projections
    const projections = await this.db
      .selectFrom("player_projection as pp")
      .innerJoin("player as p", "p.id", "pp.player_id")
      .select([
        "pp.player_id",
        "p.name",
        "p.positions",
        "pp.stat_components_json",
      ])
      .where("pp.projections_run_id", "=", projectionsRunId)
      .execute();

    if (projections.length === 0) {
      this.logger?.warn({ projectionsRunId }, "No projections found");
      return [];
    }

    this.logger?.info(
      { totalPlayers: projections.length, projectionsRunId },
      "Loaded player projections",
    );

    // Calculate SGP for all players
    const allProjections = projections.map(
      (p) => p.stat_components_json as StatComponents,
    );

    // DIAGNOSTIC: Log category-level statistics to validate SGP spread
    const categoryStats: Record<string, { mean: number; stdDev: number; min: number; max: number }> = {};
    for (const category of categories) {
      let allValues: number[];

      if (category.type === "COUNTING") {
        allValues = allProjections.map((p) => p[category.stat_key] || 0);
      } else if (category.type === "RATE" && category.formula_id) {
        allValues = allProjections.map((p) => {
          try {
            return calculateFinalRate(category.formula_id!, {}, p);
          } catch {
            return 0;
          }
        });
      } else {
        continue;
      }

      const sum = allValues.reduce((acc, val) => acc + val, 0);
      const mean = sum / allValues.length;
      const squaredDiffs = allValues.map((val) => Math.pow(val - mean, 2));
      const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / allValues.length;
      const stdDev = Math.sqrt(variance);
      const min = Math.min(...allValues);
      const max = Math.max(...allValues);

      categoryStats[category.category_id] = { mean, stdDev, min, max };
    }

    // DIAGNOSTIC: This log helps diagnose SGP calculation issues by showing
    // whether categories are being received with valid formula_id fields.
    // Empty categories array indicates upstream bug in category construction
    // (e.g., incorrect enum values like "counting" instead of "COUNTING").
    this.logger?.info(
      {
        categories: Object.entries(categoryStats).map(([catId, stats]) => ({
          categoryId: catId,
          mean: stats.mean.toFixed(2),
          stdDev: stats.stdDev.toFixed(2),
          min: stats.min.toFixed(2),
          max: stats.max.toFixed(2),
          range: (stats.max - stats.min).toFixed(2),
        })),
      },
      "Category statistics for SGP calculation",
    );

    const playersWithSGP: PlayerWithProjection[] = projections.map((p) => {
      const projectedStats = p.stat_components_json as StatComponents;
      const categorySGPs: Record<string, number> = {};

      // Calculate SGP per category for detailed tracking
      for (const category of categories) {
        const sgp = this.calculateCategorySGPForPlayer(
          projectedStats,
          allProjections,
          category,
        );
        categorySGPs[category.category_id] = sgp;
      }

      const sgpTotal = calculateTotalSGP(
        projectedStats,
        allProjections,
        categories,
      );

      return {
        playerId: p.player_id,
        playerName: p.name,
        positions: p.positions,
        projectedStats,
        sgpTotal,
        categorySGPs,
      };
    });

    // Group players by position and calculate replacement levels
    const replacementSGPs: Record<string, number> = {};

    // Get all unique positions from roster slots
    const positions = Object.keys(rosterSlots);

    for (const pos of positions) {
      // Find players eligible at this position
      const eligiblePlayers = playersWithSGP.filter((p) =>
        p.positions.includes(pos),
      );

      if (eligiblePlayers.length === 0) {
        replacementSGPs[pos] = 0;
        continue;
      }

      // Sort by SGP descending
      eligiblePlayers.sort((a, b) => b.sgpTotal - a.sgpTotal);

      // Get replacement level index
      const replacementIndex = getReplacementLevel(
        pos,
        rosterSlots,
        totalTeams,
      );

      // Get replacement player's SGP (or 0 if not enough players)
      // AUDIT FIX: replacementIndex is 1-based from getReplacementLevel()
      // Convert to 0-based array index by subtracting 1
      if (replacementIndex <= eligiblePlayers.length) {
        replacementSGPs[pos] = eligiblePlayers[replacementIndex - 1].sgpTotal;
      } else {
        // AUDIT FIX: Not enough players at this position - set very negative replacement
        // This makes all players at sparse positions valuable (no true replacement available)
        replacementSGPs[pos] = -10; // Highly negative = all players valuable
      }

      // DIAGNOSTIC: Always log replacement level details
      this.logger?.info(
        {
          position: pos,
          slotCount: rosterSlots[pos],
          eligibleCount: eligiblePlayers.length,
          replacementIndex,
          replacementSGP: replacementSGPs[pos].toFixed(2),
          isSparse: replacementIndex > eligiblePlayers.length,
        },
        "Calculated replacement level for position",
      );
    }

    // DIAGNOSTIC: Log overall replacement level summary
    this.logger?.info(
      {
        replacementSGPs: Object.fromEntries(
          Object.entries(replacementSGPs).map(([pos, sgp]) => [pos, sgp.toFixed(2)])
        ),
      },
      "Replacement level summary",
    );

    // Calculate VBD for each player (max across all eligible positions)
    const rankedPlayers: DraftRanking[] = playersWithSGP.map((player) => {
      let maxVBD = 0;
      let primaryPosition = player.positions[0] || "UTIL";

      // Calculate VBD for each position the player is eligible for
      for (const pos of player.positions) {
        const replacementSGP = replacementSGPs[pos] || 0;
        const vbd = calculateVBD(player.sgpTotal, replacementSGP);

        if (vbd > maxVBD) {
          maxVBD = vbd;
          primaryPosition = pos;
        }
      }

      return {
        playerId: player.playerId,
        playerName: player.playerName,
        positions: player.positions,
        primaryPosition,
        vbdScore: maxVBD,
        sgpTotal: player.sgpTotal,
        categorySGPs: player.categorySGPs,
        projectedStats: player.projectedStats,
        tier: 0, // Will assign below
      };
    });

    // Sort by VBD descending
    rankedPlayers.sort((a, b) => b.vbdScore - a.vbdScore);

    // Assign tiers
    const totalPlayers = rankedPlayers.length;
    const tier1Cutoff = Math.floor(totalPlayers * 0.1);
    const tier2Cutoff = Math.floor(totalPlayers * 0.25);
    const tier3Cutoff = Math.floor(totalPlayers * 0.5);

    rankedPlayers.forEach((player, index) => {
      if (index < tier1Cutoff) {
        player.tier = 1;
      } else if (index < tier2Cutoff) {
        player.tier = 2;
      } else if (index < tier3Cutoff) {
        player.tier = 3;
      } else {
        player.tier = 4;
      }
    });

    // Filter by position if requested
    let filteredPlayers = rankedPlayers;
    if (position) {
      filteredPlayers = rankedPlayers.filter((p) =>
        p.positions.includes(position),
      );
    }

    // Apply limit
    const result = filteredPlayers.slice(0, limit);

    this.logger?.info(
      {
        totalRanked: rankedPlayers.length,
        filtered: filteredPlayers.length,
        returned: result.length,
        replacementLevels: Object.keys(replacementSGPs).length,
      },
      "Draft rankings generated",
    );

    return result;
  }

  /**
   * Calculate SGP for a single category (for detailed tracking)
   */
  private calculateCategorySGPForPlayer(
    projection: StatComponents,
    allProjections: StatComponents[],
    category: Category,
  ): number {
    let statValue: number;
    let allValues: number[];

    if (category.type === "COUNTING") {
      statValue = projection[category.stat_key] || 0;
      allValues = allProjections.map((p) => p[category.stat_key] || 0);
    } else if (category.type === "RATE" && category.formula_id) {
      try {
        statValue = calculateFinalRate(category.formula_id, {}, projection);
        allValues = allProjections.map((p) => {
          try {
            return calculateFinalRate(category.formula_id!, {}, p);
          } catch {
            return 0;
          }
        });
      } catch {
        return 0;
      }
    } else {
      return 0;
    }

    // Calculate mean
    const sum = allValues.reduce((acc, val) => acc + val, 0);
    const mean = sum / allValues.length;

    // Calculate population standard deviation
    const squaredDiffs = allValues.map((val) => Math.pow(val - mean, 2));
    const variance =
      squaredDiffs.reduce((acc, val) => acc + val, 0) / allValues.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    let sgp = (statValue - mean) / stdDev;

    // Invert for LOWER_BETTER
    if (category.direction === "LOWER_BETTER") {
      sgp = -sgp;
    }

    return sgp;
  }

  /**
   * Calculate projected final season standings for a draft roster
   * Used by extension to show impact of draft picks on projected finish
   */
  async calculateProjectedStandings(
    config: DraftConfiguration,
    rosters: TeamRoster[],
    options?: {
      projectionsRunId?: number;
    },
  ): Promise<ProjectedStandingsResult> {
    this.logger?.info({ numTeams: rosters.length }, "Calculating projected standings");

    // Determine projections run ID
    let projectionsRunId = options?.projectionsRunId;
    if (!projectionsRunId) {
      const latestRun = await this.db
        .selectFrom("projections_run")
        .select("id")
        .where("staleness", "=", "fresh")
        .orderBy("as_of_date", "desc")
        .executeTakeFirst();

      if (!latestRun) {
        throw new Error("No fresh projections available");
      }

      projectionsRunId = latestRun.id;
    }

    // For each team, aggregate projected stats from drafted players
    const teamTotals: TeamProjectedStats[] = [];

    for (const roster of rosters) {
      const playerIds = roster.players.map(p => p.playerId);

      if (playerIds.length === 0) {
        // Team with no players - all zero stats
        teamTotals.push({
          teamId: roster.teamId,
          teamName: roster.teamName,
          stats: {},
        });
        continue;
      }

      // Fetch projections for this team's players
      const projections = await this.db
        .selectFrom("player_projection")
        .innerJoin("player", "player.id", "player_projection.player_id")
        .select([
          "player.id",
          "player_projection.stat_components_json",
        ])
        .where("player.id", "in", playerIds)
        .where("player_projection.projections_run_id", "=", projectionsRunId)
        .execute();

      // Aggregate stats using component math
      const aggregated = this.aggregateTeamStats(
        projections.map(p => p.stat_components_json as StatComponents),
      );

      teamTotals.push({
        teamId: roster.teamId,
        teamName: roster.teamName,
        stats: aggregated,
      });
    }

    // Rank teams per category
    const standings = this.rankTeams(teamTotals, config.categories, config.totalTeams);

    return {
      standings,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Aggregate team stats using component-based addition
   */
  private aggregateTeamStats(
    playerStats: StatComponents[],
  ): StatComponents {
    // Use component-based aggregation (never average rates)
    const components: StatComponents = {};

    for (const player of playerStats) {
      for (const [key, value] of Object.entries(player)) {
        if (value !== undefined) {
          components[key] = (components[key] || 0) + value;
        }
      }
    }

    return components;
  }

  /**
   * Rank teams by category and compute roto points
   */
  private rankTeams(
    teamTotals: TeamProjectedStats[],
    categories: Category[],
    totalTeams: number,
  ): ProjectedOverallRow[] {
    const standings: ProjectedOverallRow[] = [];

    // For each category, rank teams
    const categoryRanks: Record<string, Record<number, number>> = {};

    for (const category of categories) {
      const sorted = [...teamTotals].sort((a, b) => {
        const aValue = this.getCategoryValue(a.stats, category);
        const bValue = this.getCategoryValue(b.stats, category);

        return category.direction === "HIGHER_BETTER"
          ? bValue - aValue
          : aValue - bValue;
      });

      categoryRanks[category.category_id] = {};
      sorted.forEach((team, index) => {
        categoryRanks[category.category_id][team.teamId] = index + 1;
      });
    }

    // Calculate roto points per team
    for (const team of teamTotals) {
      let totalPoints = 0;

      for (const category of categories) {
        const rank = categoryRanks[category.category_id][team.teamId];
        const points = totalTeams - rank + 1; // Roto scoring
        totalPoints += points;
      }

      standings.push({
        team_id: team.teamId,
        teamName: team.teamName,
        projected_overall_points: totalPoints,
        projected_overall_rank: 0, // Assigned after sorting
      });
    }

    // Sort by total points, assign overall rank
    standings.sort((a, b) => b.projected_overall_points - a.projected_overall_points);
    standings.forEach((team, index) => {
      team.projected_overall_rank = index + 1;
    });

    return standings;
  }

  /**
   * Get category value from stats components
   */
  private getCategoryValue(stats: StatComponents, category: Category): number {
    if (category.type === "RATE" && category.formula_id) {
      // Calculate rate from components
      try {
        return calculateFinalRate(category.formula_id, {}, stats);
      } catch {
        return 0;
      }
    } else {
      // Counting stat
      return stats[category.stat_key] || 0;
    }
  }
}

/**
 * Types for projected standings calculation
 */
interface TeamRoster {
  teamId: number;
  teamName: string;
  players: { playerId: number }[];
}

interface TeamProjectedStats {
  teamId: number;
  teamName: string;
  stats: StatComponents;
}

interface ProjectedOverallRow {
  team_id: number;
  teamName: string;
  projected_overall_rank: number;
  projected_overall_points: number;
}

interface ProjectedStandingsResult {
  standings: ProjectedOverallRow[];
  generatedAt: string;
}
