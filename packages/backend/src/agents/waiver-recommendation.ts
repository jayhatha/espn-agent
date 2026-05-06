import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { SnapshotRepository } from "../db/snapshot-repository.js";
import type { Category, StatComponents } from "../../../shared/dist/index.js";
import {
  calculateFinalRate,
  PITCHING_STAT_KEYS,
  isPitcherProjection,
} from "../../../shared/dist/index.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { ESPNAdapter } from "../adapters/espn.js";
import { allocateProjections } from "../projection/allocator.js";
import type {
  AllocationInput,
  RosteredPlayer,
  RosterGap,
} from "../projection/types.js";

/**
 * Waiver Recommendation Agent
 * Per AGENTS.md §5
 *
 * Recommends add/drop moves that maximize projected standings improvement
 */

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
  topCategoryLabel?: string;
  isLegal: boolean;
  legalityIssues?: string[];
  rosterGaps?: RosterGap[]; // Roster gaps detected in post-add roster via allocateProjections
}

export class WaiverRecommendationAgent {
  private readonly repo: SnapshotRepository;

  constructor(
    private db: Kysely<Database>,
    // @ts-expect-error reserved for future standings-based scoring
    private standingsAgent: StandingsProjectionAgent,
    private espnAdapter: ESPNAdapter,
    private logger?: BaseLogger,
  ) {
    this.repo = new SnapshotRepository(db);
  }

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
      fallbackPlayers?: Array<{ id: number; name: string; positions: string[] }>;
      fallbackProjections?: Record<number, StatComponents>;
    },
  ): Promise<WaiverRecommendation[]> {
    const {
      maxRecommendations = 10,
      freeAgentPlayerIds,
      fallbackPlayers,
      fallbackProjections,
    } = options || {};

    this.logger?.info(
      { leagueId, teamId, snapshotDate },
      "Generating waiver recommendations",
    );

    // Get current roster
    const roster = await this.repo.getRosterForSnapshot(leagueId, snapshotDate, teamId);

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
          const espnPlayerIds =
            normalized.freeAgents?.map((fa) => fa.playerId) || [];

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

      if (freeAgents.length === 0) {
        this.logger?.warn(
          { leagueId, snapshotDate },
          "No authoritative free-agent pool found for waiver recommendations",
        );
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

    // Pre-fetch all invariant data for simulation (hoisted from simulateSwap to avoid O(n*m) queries)
    const snapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    if (!snapshot || !snapshot.projections_run_id) {
      this.logger?.warn(
        { leagueId, snapshotDate },
        "No snapshot or projections run found",
      );
      return [];
    }


    const settings = await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("id", "=", snapshot.settings_version_id)
      .executeTakeFirst();

    if (!settings) {
      this.logger?.warn({ leagueId }, "No settings version found");
      return [];
    }

    const categories = settings.settings_json.categories as Category[];

    // Pre-fetch current team projections for all categories
    const currentProjections = await this.db
      .selectFrom("team_daily_projected_category")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .where("team_id", "=", teamId)
      .execute();

    // Pre-fetch all teams' projections for re-ranking
    const allTeamsProjections = await this.db
      .selectFrom("team_daily_projected_category")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    const numTeams = new Set(allTeamsProjections.map((p) => p.team_id)).size;

    // Pre-fetch all player projections in a single batch query
    const allPlayerIds = [...freeAgents, ...roster.map((r) => r.player_id)];
    const playerMap = new Map<
      number,
      { id: number; name: string; positions: string[] }
    >();
    const projectionMap = new Map<number, any>();

    if (allPlayerIds.length > 0) {
      const [players, projections] = await Promise.all([
        this.db
          .selectFrom("player")
          .select(["id", "name", "positions"])
          .where("id", "in", allPlayerIds)
          .execute(),
        this.repo.getPlayerProjections(snapshot.projections_run_id, allPlayerIds),
      ]);

      for (const player of players) {
        playerMap.set(player.id, player);
      }
      for (const proj of projections) {
        projectionMap.set(proj.player_id, proj);
      }

      for (const fallbackPlayer of fallbackPlayers ?? []) {
        if (!playerMap.has(fallbackPlayer.id)) {
          playerMap.set(fallbackPlayer.id, fallbackPlayer);
        }
      }

      for (const [playerId, statComponents] of Object.entries(
        fallbackProjections ?? {},
      )) {
        const numericPlayerId = Number(playerId);
        if (!projectionMap.has(numericPlayerId)) {
          projectionMap.set(numericPlayerId, {
            player_id: numericPlayerId,
            stat_components_json: statComponents,
          });
        }
      }
    }

    // Pre-score free agents by projection value to limit simulation pool
    const scoredFreeAgents = freeAgents
      .map((id) => {
        const proj = projectionMap.get(id);
        if (!proj) return { id, score: 0 };
        const c = proj.stat_components_json as Record<string, number>;
        // Quick value score: HR + RBI + R + SB for hitters, K + W*5 + SV*5 for pitchers
        const isPitcher = (c.IP ?? 0) > 0 && (c.AB ?? 0) === 0;
        const score = isPitcher
          ? (c.K ?? 0) + (c.W ?? 0) * 5 + (c.SV ?? 0) * 5
          : (c.HR ?? 0) + (c.RBI ?? 0) + (c.R ?? 0) + (c.SB ?? 0);
        return { id, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 40); // Top 40 free agents by projected value

    // Simulate add/drops with early exit
    const recommendations: WaiverRecommendation[] = [];
    const TARGET_RECS = maxRecommendations * 3; // Collect 3x target to allow filtering

    for (const { id: addPlayerId } of scoredFreeAgents) {
      if (recommendations.length >= TARGET_RECS) break; // Early exit

      for (const rosterPlayer of roster) {
        const dropPlayerId = rosterPlayer.player_id;

        // Skip if same player
        if (addPlayerId === dropPlayerId) continue;

        // Simulate swap and compute delta
        const delta = this.simulateSwapFromCache(
          addPlayerId,
          dropPlayerId,
          baseline.projected_overall_points,
          categories,
          currentProjections,
          allTeamsProjections,
          numTeams,
          teamId,
          projectionMap,
        );

        if (delta && delta.deltaOverallPoints > 0) {
          const addPlayer = playerMap.get(addPlayerId);
          const dropPlayer = playerMap.get(dropPlayerId);

          if (addPlayer && dropPlayer) {
            // Validate position eligibility
            const canReplace = this.canReplacePosition(
              addPlayer.positions,
              dropPlayer.positions,
            );

            const isLegal = canReplace;
            const legalityIssues = canReplace
              ? undefined
              : [
                  `Cannot replace ${dropPlayer.positions.join("/")} with ${addPlayer.positions.join("/")}`,
                ];

            recommendations.push({
              addPlayerId,
              addPlayerName: addPlayer.name,
              dropPlayerId,
              dropPlayerName: dropPlayer.name,
              deltaOverallPoints: delta.deltaOverallPoints,
              categoryImpacts: delta.categoryImpacts,
              explanation: this.generateExplanation(delta),
              topCategoryLabel: this.generateTopCategoryLabel(
                delta.categoryImpacts,
              ),
              isLegal,
              legalityIssues,
            });
          }
        }
      }
    }

    // Filter to only legal recommendations, sort by delta, and return top N
    const legalRecommendations = recommendations.filter((r) => r.isLegal);
    legalRecommendations.sort(
      (a, b) => b.deltaOverallPoints - a.deltaOverallPoints,
    );

    this.logger?.info(
      {
        totalEvaluated: recommendations.length,
        legalCount: legalRecommendations.length,
        illegalCount: recommendations.length - legalRecommendations.length,
      },
      "Filtered recommendations by position legality",
    );

    const topN = legalRecommendations.slice(0, maxRecommendations);

    // Detect roster gaps via allocateProjections for top-N recommendations
    const rosterSlots =
      ((settings.settings_json as any).roster_slots as Record<
        string,
        number
      >) || {};
    const [{ gsUsed, gsCap }, projectionAsOfDate] = await Promise.all([
      this.getGsData(leagueId, teamId),
      this.getProjectionAsOfDate(snapshot.projections_run_id),
    ]);

    for (const rec of topN) {
      const rosterGaps = this.detectPostSwapGaps(
        rec.addPlayerId,
        rec.dropPlayerId,
        roster,
        playerMap,
        projectionMap,
        rosterSlots,
        gsUsed,
        gsCap,
        projectionAsOfDate,
        snapshotDate,
      );
      rec.rosterGaps = rosterGaps;
    }

    return topN;
  }


  /**
   * Simulate a swap using pre-fetched data (no DB queries).
   * All invariant data is fetched once in getRecommendations and passed in.
   */
  private simulateSwapFromCache(
    addPlayerId: number,
    dropPlayerId: number,
    _baselinePoints: number,
    categories: Category[],
    currentProjections: any[],
    allTeamsProjections: any[],
    numTeams: number,
    teamId: number,
    projectionMap: Map<number, any>,
  ): {
    deltaOverallPoints: number;
    categoryImpacts: Array<{
      categoryId: string;
      categoryName: string;
      deltaRank: number;
      deltaPoints: number;
    }>;
  } | null {
    const addProjection = projectionMap.get(addPlayerId);
    const dropProjection = projectionMap.get(dropPlayerId);

    if (!addProjection || !dropProjection) {
      return null;
    }

    // Get components
    const addComponents = addProjection.stat_components_json as StatComponents;
    const dropComponents =
      dropProjection.stat_components_json as StatComponents;

    // Detect player types
    const addIsPitcher = isPitcherProjection(addComponents);
    const dropIsPitcher = isPitcherProjection(dropComponents);

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
      const categoryMatchesDrop = isPitchingCat
        ? dropIsPitcher
        : !dropIsPitcher;

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
          this.logger?.info(
            {
              category: category.stat_key,
              oldValue: Number(currentProj.projected_value),
              delta,
              newValue,
            },
            "Counting stat delta",
          );
        }
      } else if (category.type === "RATE" && category.formula_id) {
        // Component-based recalculation for rate stats
        const currentComponents = (currentProj.projected_components_json ||
          {}) as StatComponents;

        // Remove dropped player's components
        const withoutDrop: StatComponents = {};
        for (const key of Object.keys(currentComponents)) {
          withoutDrop[key] =
            (currentComponents[key] || 0) - (dropComponents[key] || 0);
        }

        // Add new player's components
        const withAdd: StatComponents = {};
        const allKeys = new Set([
          ...Object.keys(withoutDrop),
          ...Object.keys(addComponents),
        ]);
        for (const key of allKeys) {
          withAdd[key] = (withoutDrop[key] || 0) + (addComponents[key] || 0);
        }

        if (isPitchingCat) {
          this.logger?.info(
            {
              category: category.stat_key,
              oldValue: Number(currentProj.projected_value),
              newComponents: withAdd,
            },
            "Rate stat calculation",
          );
        }

        // Calculate new rate value
        try {
          newValue = calculateFinalRate(category.formula_id, {}, withAdd);

          if (isPitchingCat) {
            this.logger?.info(
              {
                category: category.stat_key,
                oldValue: Number(currentProj.projected_value),
                newValue,
              },
              "Calculated new rate value",
            );
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
        this.logger?.info(
          {
            category: category.stat_key,
            oldRank,
            newRank,
            deltaPoints,
          },
          "Rank change for pitching category",
        );
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
    const sorted = delta.categoryImpacts
      .filter((i) => Math.abs(i.deltaPoints) > 0)
      .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints));

    if (sorted.length === 0) {
      return `Net ${delta.deltaOverallPoints.toFixed(1)} projected roto points. Minimal category changes.`;
    }

    const top = sorted[0];
    const topLabel = `This move gets you ${top.deltaPoints > 0 ? "+" : ""}${top.deltaPoints.toFixed(0)} roto point${Math.abs(top.deltaPoints) !== 1 ? "s" : ""} in ${top.categoryName}.`;

    const others = sorted.slice(1, 3);
    const othersLabel =
      others.length > 0
        ? " Also impacts: " +
          others
            .map(
              (i) =>
                `${i.categoryName} (${i.deltaPoints > 0 ? "+" : ""}${i.deltaPoints.toFixed(1)})`,
            )
            .join(", ") +
          "."
        : "";

    return `${topLabel}${othersLabel} Net ${delta.deltaOverallPoints > 0 ? "+" : ""}${delta.deltaOverallPoints.toFixed(1)} projected roto points overall.`;
  }

  private generateTopCategoryLabel(
    categoryImpacts: Array<{
      categoryId: string;
      categoryName: string;
      deltaRank: number;
      deltaPoints: number;
    }>,
  ): string | undefined {
    const top = categoryImpacts
      .filter((i) => Math.abs(i.deltaPoints) > 0)
      .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))[0];

    if (!top) return undefined;

    return `This move gets you ${top.deltaPoints > 0 ? "+" : ""}${top.deltaPoints.toFixed(0)} roto point${Math.abs(top.deltaPoints) !== 1 ? "s" : ""} in ${top.categoryName}`;
  }

  /**
   * Detect roster gaps after an add/drop swap using allocateProjections.
   * Called synchronously (no DB queries) using already-fetched data.
   */
  private detectPostSwapGaps(
    addPlayerId: number,
    dropPlayerId: number,
    currentRoster: Array<{ player_id: number }>,
    playerMap: Map<number, { id: number; name: string; positions: string[] }>,
    projectionMap: Map<number, any>,
    rosterSlots: Record<string, number>,
    gsUsed: number,
    gsCap: number,
    projectionAsOfDate: string,
    snapshotDate: string,
  ): RosterGap[] {
    // Build post-swap roster player list
    const postSwapPlayerIds = currentRoster
      .map((r) => r.player_id)
      .filter((id) => id !== dropPlayerId);
    postSwapPlayerIds.push(addPlayerId);

    // Build projectionsByPlayerId map from cached data
    const projectionsByPlayerId = new Map<number, StatComponents>();
    for (const playerId of postSwapPlayerIds) {
      const proj = projectionMap.get(playerId);
      if (proj) {
        projectionsByPlayerId.set(
          playerId,
          proj.stat_components_json as StatComponents,
        );
      }
    }

    // Build RosteredPlayer array
    const rosterPlayers: RosteredPlayer[] = postSwapPlayerIds.map(
      (playerId) => {
        const player = playerMap.get(playerId);
        return {
          playerId,
          positions: player?.positions || [],
          rosterStatus: "active" as const,
          rosterSlot: null,
          projectedComponents: null,
        };
      },
    );

    const allocationInput: AllocationInput = {
      roster: rosterPlayers,
      rosterSlots,
      projectionsByPlayerId,
      gsUsed,
      gsCap,
      projectionAsOfDate,
      snapshotDate,
    };

    const result = allocateProjections(allocationInput);
    return result.gaps;
  }

  /**
   * Get GS used and GS cap for a team
   */
  private async getGsData(
    leagueId: number,
    teamId: number,
  ): Promise<{ gsUsed: number; gsCap: number }> {
    const DEFAULT_GS_CAP = 200;

    const settings = await this.db
      .selectFrom("league_settings_version")
      .select("settings_json")
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    let gsCap = DEFAULT_GS_CAP;
    if (settings?.settings_json) {
      const json = settings.settings_json as unknown as Record<string, unknown>;
      const rosterSlots = json.roster_slots as
        | Record<string, number>
        | undefined;
      if (rosterSlots?.GS_LIMIT !== undefined) {
        gsCap = rosterSlots.GS_LIMIT;
      }
    }

    const team = await this.db
      .selectFrom("team")
      .select(["espn_team_id"])
      .where("id", "=", teamId)
      .executeTakeFirst();

    if (team) {
      const latestPayload = await this.db
        .selectFrom("league_raw_payload")
        .select(["response_json"])
        .where("league_id", "=", leagueId)
        .orderBy("fetched_at", "desc")
        .executeTakeFirst();

      if (latestPayload) {
        const raw = latestPayload.response_json as any;
        const espnTeam = raw?.teams?.find(
          (t: any) => t.id === team.espn_team_id,
        );
        const gsFromEspn = espnTeam?.valuesByStat?.[33];
        if (typeof gsFromEspn === "number" && gsFromEspn >= 0) {
          return { gsUsed: gsFromEspn, gsCap };
        }
      }
    }

    return { gsUsed: 0, gsCap };
  }

  /**
   * Get projection as_of_date for staleness prorating
   */
  private async getProjectionAsOfDate(
    projectionsRunId: number,
  ): Promise<string> {
    const run = await this.db
      .selectFrom("projections_run")
      .select("as_of_date")
      .where("id", "=", projectionsRunId)
      .executeTakeFirstOrThrow();
    return run.as_of_date;
  }

  /**
   * Check if adding a player can validly replace dropping another player based on positions
   */
  private canReplacePosition(
    addPlayerPositions: string[],
    dropPlayerPositions: string[],
  ): boolean {
    this.logger?.info(
      {
        addPlayerPositions,
        dropPlayerPositions,
      },
      "Checking position eligibility",
    );

    // Allow swap if players share any common position
    const hasCommonPosition = addPlayerPositions.some((pos) =>
      dropPlayerPositions.includes(pos),
    );

    if (hasCommonPosition) {
      this.logger?.info(
        { hasCommonPosition: true },
        "Positions share common position - LEGAL",
      );
      return true;
    }

    // Basic heuristic: check if both are batters or both are pitchers
    const addIsPitcher = addPlayerPositions.some(
      (p) => p === "SP" || p === "RP" || p === "P",
    );
    const dropIsPitcher = dropPlayerPositions.some(
      (p) => p === "SP" || p === "RP" || p === "P",
    );

    const canReplace = addIsPitcher === dropIsPitcher;

    this.logger?.info(
      {
        addIsPitcher,
        dropIsPitcher,
        canReplace,
      },
      "Position type check result",
    );

    // Only allow same type replacements
    return canReplace;
  }
}
