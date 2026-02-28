import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { Category, StatComponents } from "../../../shared/dist/index.js";
import { calculateFinalRate } from "../../../shared/dist/index.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { ESPNAdapter } from "../adapters/espn.js";

/**
 * Waiver Recommendation Agent
 * Per AGENTS.md §5
 *
 * Recommends add/drop moves that maximize projected standings improvement
 */

/** Stat keys that belong to pitching categories */
const PITCHING_STAT_KEYS = new Set([
  // Pitching counting stats
  "K", "W", "L", "SV", "HLD", "QS", "CG", "BLSV", "SVO",
  "ER", "OUTS", "HA", "BBA", "HRA",
  // Pitching rate stats
  "ERA", "WHIP", "K9", "WPCT",
]);

/** Detect whether a projection is for a pitcher based on its components */
function isPitcherProjection(components: StatComponents): boolean {
  return (components.IP ?? 0) > 0 || (components.ER !== undefined);
}

export interface WaiverRecommendation {
  addPlayerId: number;
  addPlayerName: string;
  dropPlayerId: number;
  dropPlayerName: string;
  deltaOverallPoints: number;
  categoryImpacts: Array<{
    categoryId: string;
    categoryName: string;
    deltaRank: number;
    deltaPoints: number;
  }>;
  explanation: string;
  isLegal: boolean;
  legalityIssues?: string[];
}

export class WaiverRecommendationAgent {
  constructor(
    private db: Kysely<Database>,
    // @ts-expect-error reserved for future standings-based scoring
    private standingsAgent: StandingsProjectionAgent,
    private espnAdapter: ESPNAdapter,
    private logger?: Logger,
  ) {}

  /**
   * Get waiver recommendations for a team
   */
  async getRecommendations(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    options?: {
      maxRecommendations?: number;
      freeAgentPlayerIds?: number[];
    },
  ): Promise<WaiverRecommendation[]> {
    const { maxRecommendations = 10, freeAgentPlayerIds } = options || {};

    this.logger?.info(
      { leagueId, teamId, snapshotDate },
      "Generating waiver recommendations",
    );

    // Get current roster
    const roster = await this.db
      .selectFrom("team_roster_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .where("team_id", "=", teamId)
      .execute();

    // Get free agents using four-tier strategy
    let freeAgents: number[];
    if (freeAgentPlayerIds) {
      // Tier 1: Use provided list
      freeAgents = freeAgentPlayerIds;
    } else {
      // Tier 2: Query league_free_agent_snapshot table (primary source)
      const snapshotFreeAgents = await this.db
        .selectFrom("league_free_agent_snapshot")
        .select("player_id")
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", snapshotDate)
        .execute();

      if (snapshotFreeAgents.length > 0) {
        freeAgents = snapshotFreeAgents.map((fa) => fa.player_id);
      } else {
        // Tier 3: Try to parse from latest raw ESPN payload (fallback for old snapshots)
        const latestPayload = await this.db
          .selectFrom("league_raw_payload")
          .select("response_json")
          .where("league_id", "=", leagueId)
          .orderBy("fetched_at", "desc")
          .executeTakeFirst();

        if (latestPayload) {
          // Parse free agents from raw payload (ESPN may not include them, so this could still be empty)
          const normalized = this.espnAdapter.normalizeLeagueData(
            latestPayload.response_json as Record<string, unknown>,
          );

          // Map ESPN player IDs to internal player IDs
          const espnPlayerIds = normalized.freeAgents?.map((fa) => fa.playerId) || [];

          if (espnPlayerIds.length > 0) {
            const freeAgentPlayers = await this.db
              .selectFrom("player")
              .select("id")
              .where("id", "in", espnPlayerIds)
              .execute();

            freeAgents = freeAgentPlayers.map((p) => p.id);
          } else {
            freeAgents = [];
          }
        } else {
          freeAgents = [];
        }
      }

      // Tier 4: Fallback to projection-based free agents if still empty
      if (freeAgents.length === 0) {
        const snapshot = await this.db
          .selectFrom("league_daily_snapshot")
          .selectAll()
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", snapshotDate)
          .executeTakeFirst();

        if (snapshot && snapshot.projections_run_id) {
          // Get all rostered players
          const rosteredPlayerIds = await this.db
            .selectFrom("team_roster_snapshot")
            .select("player_id")
            .where("league_id", "=", leagueId)
            .where("snapshot_date", "=", snapshotDate)
            .execute();

          const rosteredSet = new Set(rosteredPlayerIds.map((r) => r.player_id));

          // Get top 50 projected players not on rosters
          const topProjections = await this.db
            .selectFrom("player_projection as pp")
            .innerJoin("player as p", "p.id", "pp.player_id")
            .select(["pp.player_id", "pp.stat_components_json"])
            .where("pp.projections_run_id", "=", snapshot.projections_run_id)
            .execute();

          // Score by total counting stats (simplified heuristic)
          const scoredPlayers = topProjections
            .filter((p) => !rosteredSet.has(p.player_id))
            .map((p) => {
              const stats = p.stat_components_json as StatComponents;
              // Simple score: sum of key counting stats
              const score =
                (stats.HR || 0) +
                (stats.RBI || 0) +
                (stats.R || 0) +
                (stats.SB || 0) +
                (stats.W || 0) +
                (stats.SV || 0) +
                (stats.K || 0) * 0.1 +
                (stats.HLD || 0);
              return { playerId: p.player_id, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 50);

          freeAgents = scoredPlayers.map((p) => p.playerId);
        } else {
          freeAgents = [];
        }
      }
    }

    this.logger?.info(
      { leagueId, freeAgentCount: freeAgents.length },
      "Free agents identified",
    );

    // Get baseline projections
    const baseline = await this.db
      .selectFrom("team_daily_projected_overall")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .where("team_id", "=", teamId)
      .executeTakeFirst();

    if (!baseline) {
      this.logger?.warn({ teamId }, "No baseline projections found");
      return [];
    }

    // Pre-fetch all player data in batch (free agents + roster players)
    const allPlayerIds = [...freeAgents, ...roster.map((r) => r.player_id)];
    const playerMap = new Map<number, { id: number; name: string; positions: string[] }>();

    if (allPlayerIds.length > 0) {
      const players = await this.db
        .selectFrom("player")
        .select(["id", "name", "positions"])
        .where("id", "in", allPlayerIds)
        .execute();

      for (const player of players) {
        playerMap.set(player.id, player);
      }
    }

    // Simulate add/drops
    const recommendations: WaiverRecommendation[] = [];

    for (const addPlayerId of freeAgents) {
      for (const rosterPlayer of roster) {
        const dropPlayerId = rosterPlayer.player_id;

        // Skip if same player
        if (addPlayerId === dropPlayerId) continue;

        // Simulate swap and compute delta
        const delta = await this.simulateSwap(
          leagueId,
          teamId,
          snapshotDate,
          addPlayerId,
          dropPlayerId,
          baseline.projected_overall_points,
        );

        if (delta && delta.deltaOverallPoints > 0) {
          const addPlayer = playerMap.get(addPlayerId);
          const dropPlayer = playerMap.get(dropPlayerId);

          if (addPlayer && dropPlayer) {
            // Validate position eligibility
            const canReplace = this.canReplacePosition(
              addPlayer.positions,
              dropPlayer.positions
            );

            this.logger?.info({
              addPlayer: addPlayer.name,
              addPositions: addPlayer.positions,
              dropPlayer: dropPlayer.name,
              dropPositions: dropPlayer.positions,
              canReplace,
            }, "Position validation result for recommendation");

            const isLegal = canReplace;
            const legalityIssues = canReplace
              ? undefined
              : [`Cannot replace ${dropPlayer.positions.join("/")} with ${addPlayer.positions.join("/")}`];

            recommendations.push({
              addPlayerId,
              addPlayerName: addPlayer.name,
              dropPlayerId,
              dropPlayerName: dropPlayer.name,
              deltaOverallPoints: delta.deltaOverallPoints,
              categoryImpacts: delta.categoryImpacts,
              explanation: this.generateExplanation(delta),
              isLegal,
              legalityIssues,
            });
          }
        }
      }
    }

    // Filter to only legal recommendations, sort by delta, and return top N
    const legalRecommendations = recommendations.filter(r => r.isLegal);
    legalRecommendations.sort((a, b) => b.deltaOverallPoints - a.deltaOverallPoints);

    this.logger?.info({
      totalEvaluated: recommendations.length,
      legalCount: legalRecommendations.length,
      illegalCount: recommendations.length - legalRecommendations.length,
    }, "Filtered recommendations by position legality");

    return legalRecommendations.slice(0, maxRecommendations);
  }

  private async simulateSwap(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    addPlayerId: number,
    dropPlayerId: number,
    _baselinePoints: number,
  ): Promise<{
    deltaOverallPoints: number;
    categoryImpacts: Array<{
      categoryId: string;
      categoryName: string;
      deltaRank: number;
      deltaPoints: number;
    }>;
  } | null> {
    // Get snapshot and settings
    const snapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    if (!snapshot || !snapshot.projections_run_id) {
      return null;
    }

    const settings = await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("id", "=", snapshot.settings_version_id)
      .executeTakeFirst();

    if (!settings) {
      return null;
    }

    const categories = (settings.settings_json as any).categories as Category[];

    // Get projections for add/drop players
    const [addProjection, dropProjection] = await Promise.all([
      this.db
        .selectFrom("player_projection")
        .selectAll()
        .where("projections_run_id", "=", snapshot.projections_run_id)
        .where("player_id", "=", addPlayerId)
        .executeTakeFirst(),
      this.db
        .selectFrom("player_projection")
        .selectAll()
        .where("projections_run_id", "=", snapshot.projections_run_id)
        .where("player_id", "=", dropPlayerId)
        .executeTakeFirst(),
    ]);

    if (!addProjection || !dropProjection) {
      return null;
    }

    // Get components
    const addComponents = addProjection.stat_components_json as StatComponents;
    const dropComponents = dropProjection.stat_components_json as StatComponents;

    // Detect player types
    const addIsPitcher = isPitcherProjection(addComponents);
    const dropIsPitcher = isPitcherProjection(dropComponents);

    // Get current team projections for all categories
    const currentProjections = await this.db
      .selectFrom("team_daily_projected_category")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .where("team_id", "=", teamId)
      .execute();

    // Get all teams' projections for re-ranking
    const allTeamsProjections = await this.db
      .selectFrom("team_daily_projected_category")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    const numTeams = new Set(allTeamsProjections.map((p) => p.team_id)).size;

    // Simulate new values per category
    const categoryImpacts: Array<{
      categoryId: string;
      categoryName: string;
      deltaRank: number;
      deltaPoints: number;
    }> = [];

    let totalDeltaPoints = 0;

    for (const category of categories) {
      const currentProj = currentProjections.find(
        (p) => p.category_id === category.category_id,
      );

      if (!currentProj) {
        continue;
      }

      // Check if category type matches player types
      const isPitchingCat = PITCHING_STAT_KEYS.has(category.stat_key);
      const categoryMatchesAdd = isPitchingCat ? addIsPitcher : !addIsPitcher;
      const categoryMatchesDrop = isPitchingCat ? dropIsPitcher : !dropIsPitcher;

      // If neither player contributes to this category, no change (delta = 0)
      if (!categoryMatchesAdd && !categoryMatchesDrop) {
        // No change - include with deltaRank: 0, deltaPoints: 0
        categoryImpacts.push({
          categoryId: category.category_id,
          categoryName: category.name,
          deltaRank: 0,
          deltaPoints: 0,
        });
        continue;
      }

      let newValue: number;

      if (category.type === "COUNTING") {
        // Simple addition/subtraction for counting stats
        const delta =
          (addComponents[category.stat_key] || 0) -
          (dropComponents[category.stat_key] || 0);
        newValue = Number(currentProj.projected_value) + delta;

        if (isPitchingCat && Math.abs(delta) > 0) {
          this.logger?.info({
            category: category.stat_key,
            oldValue: Number(currentProj.projected_value),
            delta,
            newValue,
          }, "Counting stat delta");
        }
      } else if (category.type === "RATE" && category.formula_id) {
        // Component-based recalculation for rate stats
        const currentComponents = (currentProj.projected_components_json || {}) as StatComponents;

        // Remove dropped player's components
        const withoutDrop: StatComponents = {};
        for (const key of Object.keys(currentComponents)) {
          withoutDrop[key] =
            (currentComponents[key] || 0) - (dropComponents[key] || 0);
        }

        // Add new player's components
        const withAdd: StatComponents = {};
        const allKeys = new Set([...Object.keys(withoutDrop), ...Object.keys(addComponents)]);
        for (const key of allKeys) {
          withAdd[key] = (withoutDrop[key] || 0) + (addComponents[key] || 0);
        }

        if (isPitchingCat) {
          this.logger?.info({
            category: category.stat_key,
            oldValue: Number(currentProj.projected_value),
            newComponents: withAdd,
          }, "Rate stat calculation");
        }

        // Calculate new rate value
        try {
          newValue = calculateFinalRate(category.formula_id, {}, withAdd);

          if (isPitchingCat) {
            this.logger?.info({
              category: category.stat_key,
              oldValue: Number(currentProj.projected_value),
              newValue,
            }, "Calculated new rate value");
          }
        } catch (err) {
          this.logger?.warn(
            { categoryId: category.category_id, error: err },
            "Failed to calculate rate stat, skipping",
          );
          continue;
        }
      } else {
        continue;
      }

      // Re-rank this category with new value
      const categoryValues = allTeamsProjections
        .filter((p) => p.category_id === category.category_id)
        .map((p) => ({
          teamId: p.team_id,
          value: p.team_id === teamId ? newValue : Number(p.projected_value),
        }));

      // Sort by direction
      categoryValues.sort((a, b) => {
        if (category.direction === "HIGHER_BETTER") {
          return b.value - a.value;
        } else {
          return a.value - b.value;
        }
      });

      // Find old and new ranks
      const oldRank = currentProj.projected_rank;
      const newRank = categoryValues.findIndex((v) => v.teamId === teamId) + 1;

      const oldPoints = numTeams - oldRank + 1;
      const newPoints = numTeams - newRank + 1;
      const deltaPoints = newPoints - oldPoints;

      if (isPitchingCat && deltaPoints !== 0) {
        this.logger?.info({
          category: category.stat_key,
          oldRank,
          newRank,
          deltaPoints,
        }, "Rank change for pitching category");
      }

      totalDeltaPoints += deltaPoints;

      categoryImpacts.push({
        categoryId: category.category_id,
        categoryName: category.name,
        deltaRank: newRank - oldRank, // Negative = improvement
        deltaPoints: deltaPoints,
      });
    }

    return {
      deltaOverallPoints: totalDeltaPoints,
      categoryImpacts,
    };
  }

  private generateExplanation(delta: {
    deltaOverallPoints: number;
    categoryImpacts: Array<{
      categoryId: string;
      categoryName: string;
      deltaRank: number;
      deltaPoints: number;
    }>;
  }): string {
    const topImpacts = delta.categoryImpacts
      .filter((i) => Math.abs(i.deltaPoints) > 0)
      .slice(0, 3)
      .map(
        (i) =>
          `${i.categoryName} (${i.deltaPoints > 0 ? "+" : ""}${i.deltaPoints.toFixed(1)})`,
      )
      .join(", ");

    return `Gain ${delta.deltaOverallPoints.toFixed(1)} projected points. Top impacts: ${topImpacts || "minimal category changes"}.`;
  }

  /**
   * Check if adding a player can validly replace dropping another player based on positions
   */
  private canReplacePosition(
    addPlayerPositions: string[],
    dropPlayerPositions: string[]
  ): boolean {
    this.logger?.info({
      addPlayerPositions,
      dropPlayerPositions,
    }, "Checking position eligibility");

    // Allow swap if players share any common position
    const hasCommonPosition = addPlayerPositions.some(pos =>
      dropPlayerPositions.includes(pos)
    );

    if (hasCommonPosition) {
      this.logger?.info({ hasCommonPosition: true }, "Positions share common position - LEGAL");
      return true;
    }

    // Basic heuristic: check if both are batters or both are pitchers
    const addIsPitcher = addPlayerPositions.some(p => p === "SP" || p === "RP" || p === "P");
    const dropIsPitcher = dropPlayerPositions.some(p => p === "SP" || p === "RP" || p === "P");

    const canReplace = addIsPitcher === dropIsPitcher;

    this.logger?.info({
      addIsPitcher,
      dropIsPitcher,
      canReplace,
    }, "Position type check result");

    // Only allow same type replacements
    return canReplace;
  }
}
