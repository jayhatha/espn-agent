import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";

/**
 * Trade Recommendation Agent
 *
 * Analyzes proposed trades and generates trade recommendations
 * - Impact analysis for proposed trades
 * - Candidate trade generation (1-for-1, 2-for-2)
 * - Fairness scoring based on projected standings impact
 */

export interface TradePlayer {
  playerId: number;
  playerName: string;
}

export interface ProposedTrade {
  givePlayers: TradePlayer[];
  receivePlayers: TradePlayer[];
}

export interface CategoryImpact {
  categoryId: string;
  categoryName: string;
  currentValue: number;
  projectedValue: number;
  currentRank: number;
  projectedRank: number;
  deltaRank: number;
  deltaPoints: number;
}

export interface TradeImpactAnalysis {
  trade: ProposedTrade;
  currentOverallPoints: number;
  projectedOverallPoints: number;
  deltaOverallPoints: number;
  categoryImpacts: CategoryImpact[];
  fairnessScore: number; // -1 (bad for you) to 1 (great for you)
  recommendation: "accept" | "decline" | "consider";
  explanation: string;
}

export interface TradeCandidate {
  trade: ProposedTrade;
  partnerTeamId: number;
  partnerTeamName: string;
  deltaOverallPoints: number;
  categoryImpacts: CategoryImpact[];
  fairnessScore: number;
  likelihood: "high" | "medium" | "low";
  explanation: string;
}

export class TradeRecommendationAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {}

  /**
   * Analyze the impact of a proposed trade for a specific team
   */
  async analyzeTradeImpact(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    trade: ProposedTrade,
  ): Promise<TradeImpactAnalysis> {
    this.logger?.info(
      { leagueId, teamId, snapshotDate, trade },
      "Analyzing trade impact",
    );

    // Verify snapshot exists
    const snapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    if (!snapshot) {
      throw new Error(
        `No snapshot found for league ${leagueId} on ${snapshotDate}. Please trigger a snapshot first.`,
      );
    }

    // Get current standings
    const currentStandings = await this.getCurrentStandings(
      leagueId,
      teamId,
      snapshotDate,
    );

    // Get team roster
    const roster = await this.getTeamRoster(leagueId, teamId, snapshotDate);

    if (roster.length === 0) {
      throw new Error(
        `No roster data found for team ${teamId}. Please ensure a snapshot has been run for this league.`,
      );
    }

    // Get projections for all involved players
    const allPlayerIds = [
      ...trade.givePlayers.map((p) => p.playerId),
      ...trade.receivePlayers.map((p) => p.playerId),
    ];
    const projections = await this.getPlayerProjections(
      allPlayerIds,
      snapshotDate,
    );

    // Calculate projected standings after trade
    const projectedStandings = await this.simulateTradeImpact(
      leagueId,
      teamId,
      snapshotDate,
      currentStandings,
      roster,
      trade,
      projections,
    );

    // Calculate fairness score
    const fairnessScore = this.calculateFairnessScore(
      currentStandings.overallPoints,
      projectedStandings.overallPoints,
    );

    // Determine recommendation
    const deltaPoints =
      projectedStandings.overallPoints - currentStandings.overallPoints;
    let recommendation: "accept" | "decline" | "consider";
    if (deltaPoints > 2) {
      recommendation = "accept";
    } else if (deltaPoints < -1) {
      recommendation = "decline";
    } else {
      recommendation = "consider";
    }

    // Generate explanation
    const explanation = this.generateTradeExplanation(
      trade,
      deltaPoints,
      projectedStandings.categoryImpacts,
    );

    return {
      trade,
      currentOverallPoints: currentStandings.overallPoints,
      projectedOverallPoints: projectedStandings.overallPoints,
      deltaOverallPoints: deltaPoints,
      categoryImpacts: projectedStandings.categoryImpacts,
      fairnessScore,
      recommendation,
      explanation,
    };
  }

  /**
   * Generate trade candidates for a team
   */
  async generateTradeCandidates(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    maxCandidates: number = 10,
  ): Promise<TradeCandidate[]> {
    this.logger?.info(
      { leagueId, teamId, snapshotDate, maxCandidates },
      "Generating trade candidates",
    );

    // Verify snapshot exists
    const snapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    if (!snapshot) {
      throw new Error(
        `No snapshot found for league ${leagueId} on ${snapshotDate}. Please trigger a snapshot first.`,
      );
    }

    // Get all teams in the league
    const allTeams = await this.db
      .selectFrom("team")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("id", "!=", teamId)
      .execute();

    if (allTeams.length === 0) {
      this.logger?.warn({ leagueId }, "No other teams found in league");
      return [];
    }

    // OPTIMIZATION 1: Fetch all rosters in a single batch query
    const allTeamIds = [teamId, ...allTeams.map((t) => t.id)];
    const allRosters = await this.db
      .selectFrom("team_roster_snapshot as roster")
      .innerJoin("player", "roster.player_id", "player.id")
      .select([
        "roster.team_id",
        "roster.player_id",
        "player.name as player_name",
        "player.espn_player_id",
        "player.mlb_team",
        "player.positions",
        "roster.roster_status",
        "roster.roster_slot",
      ])
      .where("roster.league_id", "=", leagueId)
      .where("roster.snapshot_date", "=", snapshotDate)
      .where("roster.team_id", "in", allTeamIds)
      .where("roster.roster_status", "in", ["active", "bench"])
      .execute();

    // Group rosters by team
    const rostersByTeam = new Map<number, typeof allRosters>();
    for (const player of allRosters) {
      if (!rostersByTeam.has(player.team_id)) {
        rostersByTeam.set(player.team_id, []);
      }
      rostersByTeam.get(player.team_id)!.push(player);
    }

    const userRoster = rostersByTeam.get(teamId) || [];
    if (userRoster.length === 0) {
      throw new Error(
        `No roster data found for team ${teamId}. Please ensure a snapshot has been run for this league.`,
      );
    }

    // OPTIMIZATION 2: Get projections for all players upfront
    const allPlayerIds = allRosters.map((p) => p.player_id);
    const projectionsMap = new Map<number, Record<string, number>>();

    if (snapshot.projections_run_id && allPlayerIds.length > 0) {
      const projections = await this.db
        .selectFrom("player_projection")
        .select(["player_id", "stat_components_json"])
        .where("projections_run_id", "=", snapshot.projections_run_id)
        .where("player_id", "in", allPlayerIds)
        .execute();

      for (const proj of projections) {
        projectionsMap.set(
          proj.player_id,
          proj.stat_components_json as Record<string, number>,
        );
      }
    }

    // OPTIMIZATION 3: Pre-compute simple value scores for quick filtering
    const getPlayerValue = (playerId: number): number => {
      const proj = projectionsMap.get(playerId);
      if (!proj) return 0;

      // Simple heuristic: sum of key counting stats (not perfect but fast)
      // For batters: HR, RBI, R, SB
      // For pitchers: W, K, SV
      const batterValue = (proj.HR || 0) + (proj.RBI || 0) + (proj.R || 0) + (proj.SB || 0);
      const pitcherValue = (proj.W || 0) + ((proj.K || 0) / 10) + ((proj.SV || 0) * 2);

      return Math.max(batterValue, pitcherValue);
    };

    // Track candidates with bounded size for memory efficiency
    const candidates: TradeCandidate[] = [];
    let simulationsRun = 0;
    const maxSimulations = 500; // Limit total detailed analyses

    // For each partner team, generate 1-for-1 trade candidates
    for (const partnerTeam of allTeams) {
      const partnerRoster = rostersByTeam.get(partnerTeam.id) || [];

      if (partnerRoster.length === 0) {
        this.logger?.warn(
          { partnerTeamId: partnerTeam.id },
          "Partner team has no roster data, skipping",
        );
        continue;
      }

      // OPTIMIZATION 4: Create candidate pairs with value pre-filtering
      const tradePairs: Array<{
        give: typeof userRoster[0];
        receive: typeof partnerRoster[0];
        valueDelta: number;
      }> = [];

      for (const givePlayer of userRoster) {
        const giveValue = getPlayerValue(givePlayer.player_id);

        for (const receivePlayer of partnerRoster) {
          const receiveValue = getPlayerValue(receivePlayer.player_id);
          const valueDelta = receiveValue - giveValue;

          // Quick filter: only consider if receiving player has higher value
          // (Heuristic: we want positive value trades)
          if (valueDelta > 0) {
            tradePairs.push({ give: givePlayer, receive: receivePlayer, valueDelta });
          }
        }
      }

      // Sort by value delta (most promising first) and limit to top candidates per team
      tradePairs.sort((a, b) => b.valueDelta - a.valueDelta);
      const topPairsForTeam = tradePairs.slice(0, 20); // Only analyze top 20 per team

      // Analyze top candidates
      for (const { give: givePlayer, receive: receivePlayer } of topPairsForTeam) {
        if (simulationsRun >= maxSimulations) {
          this.logger?.info(
            { simulationsRun },
            "Reached max simulations limit, stopping candidate generation",
          );
          break;
        }

        const trade: ProposedTrade = {
          givePlayers: [
            {
              playerId: givePlayer.player_id,
              playerName: givePlayer.player_name,
            },
          ],
          receivePlayers: [
            {
              playerId: receivePlayer.player_id,
              playerName: receivePlayer.player_name,
            },
          ],
        };

        try {
          simulationsRun++;

          // Analyze impact for user's team
          const impact = await this.analyzeTradeImpact(
            leagueId,
            teamId,
            snapshotDate,
            trade,
          );

          // Only consider trades that improve the team
          if (impact.deltaOverallPoints > 0.5) {
            candidates.push({
              trade,
              partnerTeamId: partnerTeam.id,
              partnerTeamName: partnerTeam.name,
              deltaOverallPoints: impact.deltaOverallPoints,
              categoryImpacts: impact.categoryImpacts,
              fairnessScore: impact.fairnessScore,
              likelihood: this.assessTradeLikelihood(impact.fairnessScore),
              explanation: impact.explanation,
            });

            // OPTIMIZATION 5: Early termination if we have enough good candidates
            if (candidates.length >= maxCandidates * 3) {
              this.logger?.info(
                { candidatesFound: candidates.length },
                "Found sufficient candidates, stopping early",
              );
              break;
            }
          }
        } catch (error) {
          this.logger?.warn(
            { trade, error },
            "Failed to analyze trade candidate, skipping",
          );
        }
      }

      if (simulationsRun >= maxSimulations) {
        break;
      }
    }

    this.logger?.info(
      { simulationsRun, candidatesFound: candidates.length },
      "Trade candidate generation complete",
    );

    // Sort by delta overall points and return top candidates
    candidates.sort((a, b) => b.deltaOverallPoints - a.deltaOverallPoints);

    return candidates.slice(0, maxCandidates);
  }

  private async getCurrentStandings(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
  ): Promise<{ overallPoints: number; categoryImpacts: CategoryImpact[] }> {
    // Get PROJECTED overall points (not current actual points)
    const overall = await this.db
      .selectFrom("team_daily_projected_overall")
      .select(["projected_overall_points"])
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    // Get PROJECTED category data (final season projections)
    const projectedCategories = await this.db
      .selectFrom("team_daily_projected_category")
      .select([
        "category_id",
        "projected_value",
        "projected_rank",
        "projected_roto_points",
      ])
      .where("league_id", "=", leagueId)
      .where("team_id", "=", teamId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    if (!overall || projectedCategories.length === 0) {
      throw new Error(
        `No projected standings found for team ${teamId} on ${snapshotDate}. ` +
        `Please ensure projections have been uploaded and a snapshot has been run.`,
      );
    }

    // Get category metadata
    const settingsVersion = await this.db
      .selectFrom("league_daily_snapshot")
      .innerJoin(
        "league_settings_version",
        "league_daily_snapshot.settings_version_id",
        "league_settings_version.id",
      )
      .select(["league_settings_version.settings_json"])
      .where("league_daily_snapshot.league_id", "=", leagueId)
      .where("league_daily_snapshot.snapshot_date", "=", snapshotDate)
      .executeTakeFirstOrThrow();

    const categories = (settingsVersion.settings_json as any).categories || [];

    const categoryImpacts: CategoryImpact[] = projectedCategories.map((proj) => {
      const category = categories.find(
        (c: any) => c.category_id === proj.category_id,
      );
      return {
        categoryId: proj.category_id,
        categoryName: category?.name || proj.category_id,
        currentValue: Number(proj.projected_value),
        projectedValue: Number(proj.projected_value),
        currentRank: proj.projected_rank,
        projectedRank: proj.projected_rank,
        deltaRank: 0,
        deltaPoints: 0,
      };
    });

    return {
      overallPoints: Number(overall?.projected_overall_points || 0),
      categoryImpacts,
    };
  }

  private async getTeamRoster(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
  ) {
    return this.db
      .selectFrom("team_roster_snapshot as roster")
      .innerJoin("player", "roster.player_id", "player.id")
      .select([
        "roster.player_id",
        "player.name as player_name",
        "player.positions",
        "roster.roster_status",
      ])
      .where("roster.league_id", "=", leagueId)
      .where("roster.team_id", "=", teamId)
      .where("roster.snapshot_date", "=", snapshotDate)
      .where("roster.roster_status", "in", ["active", "bench"])
      .execute();
  }

  private async getPlayerProjections(
    playerIds: number[],
    asOfDate: string,
  ): Promise<Map<number, any>> {
    /**
     * Fetch rest-of-season projections for players
     * These are the projected stats for the REMAINDER of the season,
     * not full-season projections.
     */
    if (playerIds.length === 0) {
      return new Map();
    }

    const projections = await this.db
      .selectFrom("player_projection as proj")
      .innerJoin("projections_run as run", "proj.run_id", "run.id")
      .innerJoin("player", "proj.player_id", "player.id")
      .selectAll("proj")
      .where("run.as_of_date", "<=", asOfDate)
      .where(
        "proj.player_id",
        "in",
        playerIds.filter((id) => id != null),
      )
      .orderBy("run.as_of_date", "desc")
      .execute();

    const projMap = new Map();
    for (const proj of projections) {
      if (!projMap.has(proj.player_id)) {
        projMap.set(proj.player_id, proj);
      }
    }

    return projMap;
  }

  private async simulateTradeImpact(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    currentStandings: any,
    roster: any[],
    trade: ProposedTrade,
    projections: Map<number, any>,
  ): Promise<{ overallPoints: number; categoryImpacts: CategoryImpact[] }> {
    /**
     * Trade simulation logic:
     * 1. Start with PROJECTED final season totals (not current actuals)
     * 2. Subtract rest-of-season projections for players being traded away
     * 3. Add rest-of-season projections for players being acquired
     * 4. Re-rank all teams to calculate new standings
     */

    // Get league settings and categories
    const settingsVersion = await this.db
      .selectFrom("league_daily_snapshot")
      .innerJoin(
        "league_settings_version",
        "league_daily_snapshot.settings_version_id",
        "league_settings_version.id",
      )
      .select(["league_settings_version.settings_json"])
      .where("league_daily_snapshot.league_id", "=", leagueId)
      .where("league_daily_snapshot.snapshot_date", "=", snapshotDate)
      .executeTakeFirstOrThrow();

    const categories = (settingsVersion.settings_json as any).categories || [];

    // Get all teams' PROJECTED category totals (not current actuals)
    const allTeamProjections = await this.db
      .selectFrom("team_daily_projected_category")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    // Build map of team -> category -> value
    const teamCategoryValues = new Map<
      number,
      Map<string, { value: number; components?: any }>
    >();

    for (const proj of allTeamProjections) {
      if (!teamCategoryValues.has(proj.team_id)) {
        teamCategoryValues.set(proj.team_id, new Map());
      }
      teamCategoryValues.get(proj.team_id)!.set(proj.category_id, {
        value: Number(proj.projected_value),
        components: proj.projected_components_json,
      });
    }

    // Calculate the delta for the user's team
    const userTeamCategories = teamCategoryValues.get(teamId) || new Map();

    // Apply trade adjustments to user team's projected category values
    for (const category of categories) {
      const catId = category.statKey;
      const current = userTeamCategories.get(catId) || {
        value: 0,
        components: null,
      };

      // For rate stats, we need to adjust components, not the rate itself
      const isRateStat = ["AVG", "OBP", "SLG", "OPS", "ERA", "WHIP"].includes(
        catId,
      );

      if (isRateStat) {
        // Handle rate stats with component math
        // Rate stats require component-level adjustments:
        // - Start with projected final components
        // - Subtract rest-of-season components for traded-away players
        // - Add rest-of-season components for acquired players
        // - Recalculate rate from adjusted components
        // TODO: Implement proper component-based rate stat calculations
        // For now, keep the projected value unchanged
        userTeamCategories.set(catId, {
          value: current.value,
          components: current.components,
        });
      } else {
        // For counting stats, we can directly add/subtract
        let giveDelta = 0;
        for (const givePlayer of trade.givePlayers) {
          const proj = projections.get(givePlayer.playerId);
          if (proj && this.isCategoryRelevant(category, proj)) {
            giveDelta += this.getProjectedCategoryValue(category, proj);
          }
        }

        let receiveDelta = 0;
        for (const receivePlayer of trade.receivePlayers) {
          const proj = projections.get(receivePlayer.playerId);
          if (proj && this.isCategoryRelevant(category, proj)) {
            receiveDelta += this.getProjectedCategoryValue(category, proj);
          }
        }

        const netDelta = receiveDelta - giveDelta;
        const projectedValue = current.value + netDelta;
        userTeamCategories.set(catId, {
          value: projectedValue,
          components: current.components,
        });
      }
    }

    // Re-rank all teams in each category with projected values
    const newCategoryImpacts: CategoryImpact[] = [];
    let projectedOverallPoints = 0;

    for (const category of categories) {
      const catId = category.statKey;

      // Build array of {teamId, value} for ranking
      const teamValues: Array<{ teamId: number; value: number }> = [];

      for (const [tId, catMap] of teamCategoryValues.entries()) {
        const catValue = catMap.get(catId);
        teamValues.push({
          teamId: tId,
          value: catValue?.value || 0,
        });
      }

      // Sort by value (ascending or descending based on category)
      const isLowerBetter = this.isLowerBetter(category);
      teamValues.sort((a, b) => {
        if (isLowerBetter) {
          return a.value - b.value; // Lower is better (ERA, WHIP)
        } else {
          return b.value - a.value; // Higher is better (R, HR, RBI, etc.)
        }
      });

      // Assign ranks
      const numTeams = teamValues.length;
      const teamRanks = new Map<number, number>();
      teamValues.forEach((tv, idx) => {
        teamRanks.set(tv.teamId, idx + 1);
      });

      // Get current and projected rank for user team
      const currentRank = currentStandings.categoryImpacts.find(
        (ci: CategoryImpact) => ci.categoryId === catId,
      )?.currentRank || numTeams;

      const projectedRank = teamRanks.get(teamId) || numTeams;

      // Calculate roto points
      const currentPoints = Math.max(0, numTeams - currentRank + 1);
      const projectedPoints = Math.max(0, numTeams - projectedRank + 1);

      newCategoryImpacts.push({
        categoryId: catId,
        categoryName: category.name,
        currentValue: userTeamCategories.get(catId)?.value || 0,
        projectedValue: userTeamCategories.get(catId)?.value || 0,
        currentRank: currentRank,
        projectedRank: projectedRank,
        deltaRank: projectedRank - currentRank,
        deltaPoints: projectedPoints - currentPoints,
      });

      projectedOverallPoints += projectedPoints;
    }

    return {
      overallPoints: projectedOverallPoints,
      categoryImpacts: newCategoryImpacts,
    };
  }

  private isCategoryRelevant(category: any, projection: any): boolean {
    // Check if the projection has data for this category
    // Batting categories apply to batters (has AB), pitching to pitchers (has IP)
    const isBatter = projection.ab != null && Number(projection.ab) > 0;
    const isPitcher = projection.ip != null && Number(projection.ip) > 0;

    const batterCategories = ["R", "HR", "RBI", "SB", "AVG", "OBP", "SLG", "OPS"];
    const pitcherCategories = ["W", "SV", "K", "ERA", "WHIP", "QS", "HLD"];

    if (batterCategories.includes(category.statKey)) {
      return isBatter;
    }
    if (pitcherCategories.includes(category.statKey)) {
      return isPitcher;
    }

    return false;
  }

  private getProjectedCategoryValue(category: any, projection: any): number {
    const statKey = category.statKey;

    // Handle rate stats using component math
    switch (statKey) {
      case "AVG":
        return Number(projection.h || 0) / Math.max(1, Number(projection.ab || 1));
      case "OBP":
        return (
          (Number(projection.h || 0) +
            Number(projection.bb || 0) +
            Number(projection.hbp || 0)) /
          Math.max(
            1,
            Number(projection.ab || 0) +
              Number(projection.bb || 0) +
              Number(projection.hbp || 0) +
              Number(projection.sf || 0),
          )
        );
      case "SLG":
        return Number(projection.tb || 0) / Math.max(1, Number(projection.ab || 1));
      case "OPS": {
        const obp =
          (Number(projection.h || 0) +
            Number(projection.bb || 0) +
            Number(projection.hbp || 0)) /
          Math.max(
            1,
            Number(projection.ab || 0) +
              Number(projection.bb || 0) +
              Number(projection.hbp || 0) +
              Number(projection.sf || 0),
          );
        const slg =
          Number(projection.tb || 0) / Math.max(1, Number(projection.ab || 1));
        return obp + slg;
      }
      case "ERA":
        return (
          (9 * Number(projection.er || 0)) / Math.max(0.1, Number(projection.ip || 0.1))
        );
      case "WHIP":
        return (
          (Number(projection.h_p || 0) + Number(projection.bb_p || 0)) /
          Math.max(0.1, Number(projection.ip || 0.1))
        );
      // Counting stats
      case "R":
        return Number(projection.r || 0);
      case "HR":
        return Number(projection.hr || 0);
      case "RBI":
        return Number(projection.rbi || 0);
      case "SB":
        return Number(projection.sb || 0);
      case "W":
        return Number(projection.w || 0);
      case "SV":
        return Number(projection.sv || 0);
      case "K":
        return Number(projection.k || 0);
      case "QS":
        return Number(projection.qs || 0);
      case "HLD":
        return Number(projection.hld || 0);
      default:
        return 0;
    }
  }

  private isLowerBetter(category: any): boolean {
    const lowerBetterCategories = ["ERA", "WHIP"];
    return lowerBetterCategories.includes(category.statKey);
  }

  private calculateFairnessScore(
    currentPoints: number,
    projectedPoints: number,
  ): number {
    const delta = projectedPoints - currentPoints;
    // Normalize to -1 to 1 range
    // A gain of 5+ points is considered a 1.0 fairness score
    return Math.max(-1, Math.min(1, delta / 5));
  }

  private assessTradeLikelihood(
    fairnessScore: number,
  ): "high" | "medium" | "low" {
    // Trades that are too one-sided are less likely to be accepted
    if (fairnessScore > 0.6 || fairnessScore < -0.3) {
      return "low";
    } else if (fairnessScore > 0.3) {
      return "medium";
    } else {
      return "high";
    }
  }

  private generateTradeExplanation(
    trade: ProposedTrade,
    deltaPoints: number,
    categoryImpacts: CategoryImpact[],
  ): string {
    const giveNames = trade.givePlayers.map((p) => p.playerName).join(", ");
    const receiveNames = trade.receivePlayers
      .map((p) => p.playerName)
      .join(", ");

    const significantImpacts = categoryImpacts
      .filter((impact) => Math.abs(impact.deltaPoints) >= 1)
      .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))
      .slice(0, 3);

    let explanation = `Trading ${giveNames} for ${receiveNames} would result in a ${deltaPoints > 0 ? "gain" : "loss"} of ${Math.abs(deltaPoints).toFixed(1)} overall roto points. `;

    if (significantImpacts.length > 0) {
      explanation += `Significant impacts: `;
      explanation += significantImpacts
        .map(
          (impact) =>
            `${impact.categoryName} (${impact.deltaPoints > 0 ? "+" : ""}${impact.deltaPoints.toFixed(1)} pts)`,
        )
        .join(", ");
      explanation += ".";
    }

    return explanation;
  }
}
