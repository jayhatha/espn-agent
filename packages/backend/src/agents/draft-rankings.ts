import type { BaseLogger } from "pino";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type {
  Category,
  StatComponents,
  DraftRanking,
  DraftConfiguration,
} from "../../../shared/dist/index.js";
import { calculateFinalRate } from "../../../shared/dist/index.js";
import { calculateRosterBasedValues } from "./draft-value-model.js";

/**
 * Draft Rankings Agent
 * Per AGENTS.md §6
 *
 * Produces VBD-ranked player list with position-specific replacement levels
 */

export class DraftRankingsAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
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

    const settings = latestSettings.settings_json;
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
      budget: 260,
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
      // Prefer fresh, fall back to most recent stale run
      const latestRun = await this.db
        .selectFrom("projections_run")
        .select(["id", "staleness"])
        .orderBy(
          sql`CASE staleness WHEN 'fresh' THEN 0 WHEN 'stale' THEN 1 ELSE 2 END`,
          "asc",
        )
        .orderBy("as_of_date", "desc")
        .executeTakeFirst();

      if (!latestRun) {
        this.logger?.warn("No projections run found");
        return [];
      }

      if (latestRun.staleness !== "fresh") {
        this.logger?.warn(
          { runId: latestRun.id, staleness: latestRun.staleness },
          "Using stale projections run (no fresh run available)",
        );
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

    const rosterValues = calculateRosterBasedValues(
      projections.map((projection) => ({
        playerId: projection.player_id,
        positions: projection.positions,
        projectedStats: projection.stat_components_json as StatComponents,
      })),
      categories,
      rosterSlots,
      totalTeams,
    );
    const valuesByPlayer = new Map(
      rosterValues.map((value) => [value.playerId, value]),
    );
    const rankedPlayers: DraftRanking[] = projections.map((projection) => {
      const value = valuesByPlayer.get(projection.player_id)!;
      return {
        playerId: projection.player_id,
        playerName: projection.name,
        positions: value.positions,
        primaryPosition: value.primaryPosition,
        position: value.primaryPosition,
        rank: 0,
        dollarValue: 0,
        vbdScore: Math.max(0, value.sgpTotal),
        sgpTotal: value.sgpTotal,
        categorySGPs: value.categorySGPs,
        projectedStats: projection.stat_components_json as StatComponents,
        tier: 0,
      };
    });

    // Sort by VBD descending
    rankedPlayers.sort((a, b) => (b as any).vbdScore - (a as any).vbdScore);

    // Assign tiers
    const totalPlayers = rankedPlayers.length;
    const tier1Cutoff = Math.floor(totalPlayers * 0.1);
    const tier2Cutoff = Math.floor(totalPlayers * 0.25);
    const tier3Cutoff = Math.floor(totalPlayers * 0.5);

    rankedPlayers.forEach((player, index) => {
      player.rank = index + 1;
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
        (p as any).positions.includes(position),
      );
    }

    // Apply limit
    const result = filteredPlayers.slice(0, limit);

    this.logger?.info(
      {
        totalRanked: rankedPlayers.length,
        filtered: filteredPlayers.length,
        returned: result.length,
        replacementLevels: Object.keys(rosterSlots).length,
      },
      "Draft rankings generated",
    );

    return result;
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
    this.logger?.info(
      { numTeams: rosters.length },
      "Calculating projected standings",
    );

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
      const playerIds = roster.players.map((p) => p.playerId);

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
        .select(["player.id", "player_projection.stat_components_json"])
        .where("player.id", "in", playerIds)
        .where("player_projection.projections_run_id", "=", projectionsRunId)
        .execute();

      // Aggregate stats using component math
      const aggregated = this.aggregateTeamStats(
        projections.map((p) => p.stat_components_json as StatComponents),
      );

      teamTotals.push({
        teamId: roster.teamId,
        teamName: roster.teamName,
        stats: aggregated,
      });
    }

    // Rank teams per category
    const standings = this.rankTeams(
      teamTotals,
      config.categories,
      config.totalTeams,
    );

    return {
      standings,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Aggregate team stats using component-based addition
   */
  private aggregateTeamStats(playerStats: StatComponents[]): StatComponents {
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
    standings.sort(
      (a, b) => b.projected_overall_points - a.projected_overall_points,
    );
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
