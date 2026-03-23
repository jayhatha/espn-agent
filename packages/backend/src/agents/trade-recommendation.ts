import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import {
  calculateFinalRate,
  type RosterValidationResult,
  type StatComponents,
} from "../../../shared/dist/index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Static ASV lookup from tools/espn-predraft-values.json ---
let asvMapCache: Map<string, number> | null = null;

function loadAsvMap(): Map<string, number> {
  if (asvMapCache) return asvMapCache;
  try {
    const filePath = resolve(process.cwd(), "tools/espn-predraft-values.json");
    const raw = readFileSync(filePath, "utf-8");
    const entries: Array<{ name: string; salary: number }> = JSON.parse(raw);
    asvMapCache = new Map(entries.map((e) => [e.name.toLowerCase(), e.salary]));
  } catch {
    // Graceful degradation — file missing or unparseable
    asvMapCache = new Map();
  }
  return asvMapCache;
}

function getAsvForPlayer(playerName: string): number | null {
  const map = loadAsvMap();
  return map.get(playerName.toLowerCase()) ?? null;
}

/**
 * Trade Recommendation Agent
 *
 * Analyzes proposed trades and generates trade recommendations
 * - Impact analysis for proposed trades
 * - Candidate trade generation (1-for-1, 2-for-2)
 * - Fairness scoring based on projected standings impact
 */

/** Stat keys that belong to pitching categories (mirrors standings-projection.ts) */
const PITCHING_STAT_KEYS = new Set([
  // Pitching counting stats
  "K", "W", "L", "SV", "HLD", "QS", "CG", "BLSV", "SVO",
  "ER", "OUTS", "HA", "BBA", "HRA",
  // Pitching rate stats
  "ERA", "WHIP", "K9", "WPCT",
]);

const POSITION_SCARCITY: Record<string, number> = {
  C: 1.5,    // Very scarce - few quality catchers
  SS: 1.2,   // Moderately scarce
  "2B": 1.1, // Slightly scarce
  "3B": 1.0, // Average
  "1B": 0.9, // Deep position
  OF: 0.8,   // Very deep
  SP: 1.0,   // Average (many SPs but also many slots)
  RP: 1.3,   // Scarce - quality closers are rare
  P: 1.0,    // Generic pitcher slot
  UTIL: 0.5, // Not position-specific
};

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

export interface PositionalContext {
  positionGained: string[];       // Primary positions of received player(s)
  positionLost: string[];         // Primary positions of given player(s)
  fillsNeed: boolean;             // True if received player fills a thin position
  needPositions: string[];        // Positions where team has below-average depth
  positionalBonus: number;        // Bonus points added to scoring (0 to ~3)
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
  positionalContext?: PositionalContext;
  givePlayerAsv?: number | null;
  receivePlayerAsv?: number | null;
}

export class TradeRecommendationAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {}

  /**
   * Validate trade size (1-3 players per side)
   */
  static validateTradeSize(trade: ProposedTrade): { valid: boolean; error?: string } {
    if (!trade.givePlayers || trade.givePlayers.length < 1) {
      return { valid: false, error: "Must give at least 1 player" };
    }
    if (!trade.receivePlayers || trade.receivePlayers.length < 1) {
      return { valid: false, error: "Must receive at least 1 player" };
    }
    if (trade.givePlayers.length > 3) {
      return { valid: false, error: "Cannot give more than 3 players in a single trade" };
    }
    if (trade.receivePlayers.length > 3) {
      return { valid: false, error: "Cannot receive more than 3 players in a single trade" };
    }
    return { valid: true };
  }

  /**
   * Validate that post-trade roster can fill all required position slots
   */
  async validateRosterSlots(
    leagueId: number,
    teamId: number,
    snapshotDate: string,
    trade: ProposedTrade,
  ): Promise<RosterValidationResult> {
    this.logger?.info(
      { leagueId, teamId, snapshotDate, trade },
      "Validating roster slots for trade",
    );

    // Get current roster
    const currentRoster = await this.getTeamRoster(leagueId, teamId, snapshotDate);

    if (currentRoster.length === 0) {
      return {
        isLegal: false,
        issues: ["No roster data found for team"],
      };
    }

    // Get league settings to fetch roster slots
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
      .executeTakeFirst();

    if (!settingsVersion) {
      return {
        isLegal: false,
        issues: ["League settings not found"],
      };
    }

    const rosterSlots = (settingsVersion.settings_json as any).roster_slots || {};

    // Build post-trade roster: remove givePlayers, add receivePlayers
    const givePlayerIds = trade.givePlayers.map((p) => p.playerId);
    const receivePlayerIds = trade.receivePlayers.map((p) => p.playerId);

    // Fetch positions for received players
    const receivedPlayers =
      receivePlayerIds.length > 0
        ? await this.db
            .selectFrom("player")
            .select(["id as player_id", "positions"])
            .where("id", "in", receivePlayerIds)
            .execute()
        : [];

    // Build post-trade roster
    const postTradeRoster = [
      ...currentRoster
        .filter((p) => !givePlayerIds.includes(p.player_id))
        .map((p) => ({ playerId: p.player_id, positions: p.positions })),
      ...receivedPlayers.map((p) => ({ playerId: p.player_id, positions: p.positions })),
    ];

    // Run greedy slot assignment
    const issues: string[] = [];
    const assigned = new Set<number>();

    // Sort slots by specificity (specific positions first, then generic)
    const slotOrder = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "P", "UTIL", "BN", "IL"];

    for (const slotType of slotOrder) {
      const count = rosterSlots[slotType] || 0;
      if (count === 0) continue;

      let filled = 0;

      for (const player of postTradeRoster) {
        if (assigned.has(player.playerId)) continue;

        const eligible = this.canFillSlot(player.positions, slotType);
        if (eligible && filled < count) {
          assigned.add(player.playerId);
          filled++;
        }
      }

      if (filled < count) {
        issues.push(`Cannot fill all ${slotType} slots (need ${count}, filled ${filled})`);
      }
    }

    // Check for unassigned players (excluding IL)
    const unassignedCount = postTradeRoster.filter((p) => !assigned.has(p.playerId)).length;
    if (unassignedCount > 0) {
      issues.push(`${unassignedCount} players cannot be assigned to roster slots`);
    }

    return {
      isLegal: issues.length === 0,
      issues,
    };
  }

  /**
   * Helper: Check if a player can fill a specific roster slot
   */
  private canFillSlot(playerPositions: string[], slotType: string): boolean {
    // UTIL, BN, IL accept any position
    if (slotType === "UTIL" || slotType === "BN" || slotType === "IL") {
      return true;
    }

    // P slot accepts SP or RP
    if (slotType === "P") {
      return playerPositions.some((pos) => pos === "SP" || pos === "RP");
    }

    // Specific slots require exact position match
    return playerPositions.includes(slotType);
  }

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
    const startTime = Date.now();
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
        "player.id as espn_player_id",
        "player.mlb_team",
        "player.positions",
        "roster.roster_status",
        "roster.roster_slot",
        "player.espn_asv",
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

    // Fetch league settings for roster slots (for positional depth analysis)
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
      .executeTakeFirst();

    const rosterSlots =
      settingsVersion && (settingsVersion.settings_json as any).roster_slots
        ? (settingsVersion.settings_json as any).roster_slots
        : {};

    // Analyze roster depth for positional scoring
    const userRosterForDepth = userRoster.map((p) => ({
      player_id: p.player_id,
      positions: p.positions,
    }));
    const depthMap = this.analyzeRosterDepth(userRosterForDepth, rosterSlots);

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

      // OPTIMIZATION 4: Create candidate pairs with value pre-filtering and positional scoring
      const tradePairs: Array<{
        give: typeof userRoster[0];
        receive: typeof partnerRoster[0];
        valueDelta: number;
        positionalBonus: number;
        positionalContext: PositionalContext;
      }> = [];

      for (const givePlayer of userRoster) {
        const giveValue = getPlayerValue(givePlayer.player_id);

        for (const receivePlayer of partnerRoster) {
          // Filter by ESPN ASV similarity for trade realism
          const giveAsv = getAsvForPlayer(givePlayer.player_name);
          const receiveAsv = getAsvForPlayer(receivePlayer.player_name);

          // Skip if both players have ASV data and values are too far apart
          if (giveAsv != null && receiveAsv != null && giveAsv > 0 && receiveAsv > 0) {
            const asvDiff = Math.abs(giveAsv - receiveAsv);
            const maxAsv = Math.max(giveAsv, receiveAsv);
            const pctDiff = asvDiff / maxAsv;
            // Allow trades within +/-30% OR +/-$5, whichever is more generous
            const withinPct = pctDiff <= 0.30;
            const withinAbsolute = asvDiff <= 5;
            if (!withinPct && !withinAbsolute) {
              continue; // Skip this pair — ASV too far apart
            }
          }
          // If either player has no ASV data, allow the trade (don't penalize missing data)

          const receiveValue = getPlayerValue(receivePlayer.player_id);
          const valueDelta = receiveValue - giveValue;

          // Compute positional bonus for this trade pair
          const positionalContext = this.computePositionalBonus(
            [givePlayer.positions],
            [receivePlayer.positions],
            depthMap,
          );

          // Quick filter: only consider if receiving player has higher value OR fills a positional need
          // (Heuristic: we want positive value trades or trades that fill needs)
          if (valueDelta > 0 || positionalContext.fillsNeed) {
            tradePairs.push({
              give: givePlayer,
              receive: receivePlayer,
              valueDelta,
              positionalBonus: positionalContext.positionalBonus,
              positionalContext,
            });
          }
        }
      }

      // Sort by combined value delta + positional bonus (most promising first)
      tradePairs.sort(
        (a, b) =>
          b.valueDelta + b.positionalBonus - (a.valueDelta + a.positionalBonus),
      );
      const topPairsForTeam = tradePairs.slice(0, 20); // Only analyze top 20 per team

      // Analyze top candidates
      for (const {
        give: givePlayer,
        receive: receivePlayer,
        positionalContext,
      } of topPairsForTeam) {
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
            const giveAsv = getAsvForPlayer(givePlayer.player_name);
            const receiveAsv = getAsvForPlayer(receivePlayer.player_name);
            const asvNote = giveAsv != null && receiveAsv != null
              ? ` Similar value ($${Math.round(giveAsv)} vs $${Math.round(receiveAsv)}).`
              : "";

            candidates.push({
              trade,
              partnerTeamId: partnerTeam.id,
              partnerTeamName: partnerTeam.name,
              deltaOverallPoints: impact.deltaOverallPoints,
              categoryImpacts: impact.categoryImpacts,
              fairnessScore: impact.fairnessScore,
              likelihood: this.assessTradeLikelihood(impact.fairnessScore),
              explanation: this.generateTradeExplanation(
                trade,
                impact.deltaOverallPoints,
                impact.categoryImpacts,
                positionalContext,
              ) + asvNote,
              positionalContext,
              givePlayerAsv: giveAsv,
              receivePlayerAsv: receiveAsv,
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

    const elapsed = Date.now() - startTime;
    this.logger?.info(
      { simulationsRun, candidatesFound: candidates.length, elapsedMs: elapsed },
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
      .innerJoin("projections_run as run", "run.id", "proj.projections_run_id")
      .innerJoin("player", "player.id", "proj.player_id")
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
    _roster: any[],
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

    // Store original values before modifications (for currentValue in CategoryImpact)
    const originalValues = new Map<string, number>();
    for (const category of categories) {
      const catId = category.category_id;
      const current = userTeamCategories.get(catId);
      originalValues.set(catId, current?.value || 0);
    }

    // Apply trade adjustments to user team's projected category values
    for (const category of categories) {
      const catId = category.category_id;
      const current = userTeamCategories.get(catId) || {
        value: 0,
        components: null,
      };

      // For rate stats, we need to adjust components, not the rate itself
      const isRateStat = category.type === "RATE";

      if (isRateStat) {
        // Handle rate stats with component math
        // Rate stats require component-level adjustments:
        // - Start with projected final components
        // - Subtract rest-of-season components for traded-away players
        // - Add rest-of-season components for acquired players
        // - Recalculate rate from adjusted components

        // Start with a copy of current components (or empty object if none)
        const adjustedComponents: Record<string, number> = current.components
          ? { ...current.components }
          : {};

        // Subtract components from players being traded away
        for (const givePlayer of trade.givePlayers) {
          const proj = projections.get(givePlayer.playerId);
          if (proj && this.isCategoryRelevant(category, proj)) {
            const playerComponents = proj.stat_components_json as StatComponents;
            for (const [key, value] of Object.entries(playerComponents)) {
              adjustedComponents[key] = (adjustedComponents[key] || 0) - (Number(value) || 0);
            }
          }
        }

        // Add components from players being acquired
        for (const receivePlayer of trade.receivePlayers) {
          const proj = projections.get(receivePlayer.playerId);
          if (proj && this.isCategoryRelevant(category, proj)) {
            const playerComponents = proj.stat_components_json as StatComponents;
            for (const [key, value] of Object.entries(playerComponents)) {
              adjustedComponents[key] = (adjustedComponents[key] || 0) + (Number(value) || 0);
            }
          }
        }

        // Calculate the new rate from adjusted components using calculateFinalRate
        let projectedValue: number;
        try {
          // Use calculateFinalRate with empty current components since we've already
          // combined everything into adjustedComponents
          projectedValue = calculateFinalRate(
            category.formula_id!, // Use formula_id from Category, not lowercased stat_key
            {}, // Empty current components
            adjustedComponents // All combined components (current + projected - given + received)
          );

          this.logger?.info({
            category: category.stat_key,
            oldValue: current.value,
            newValue: projectedValue,
            adjustedComponents,
          }, "Rate stat calculation for trade simulation");
        } catch (error) {
          // Fallback: preserve current value for unknown rate stats or calculation errors
          this.logger?.warn(
            { catId, error },
            "Failed to calculate rate stat using calculateFinalRate, preserving current value"
          );
          projectedValue = current.value;
        }

        userTeamCategories.set(catId, {
          value: projectedValue,
          components: adjustedComponents,
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
      const catId = category.category_id;

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
        currentValue: originalValues.get(catId) || 0,
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
    // Pitching categories apply to pitchers (has IP or ER), batting to batters (has AB)
    const components = projection.stat_components_json as StatComponents;
    const isPitchingCat = PITCHING_STAT_KEYS.has(category.stat_key);
    if (isPitchingCat) {
      return (components.IP ?? 0) > 0 || components.ER !== undefined;
    } else {
      return (components.AB ?? 0) > 0;
    }
  }

  private getProjectedCategoryValue(category: any, projection: any): number {
    const components = projection.stat_components_json as StatComponents;

    // RATE stats: use formula_id with calculateFinalRate
    if (category.type === "RATE" && category.formula_id) {
      try {
        return calculateFinalRate(category.formula_id, {}, components);
      } catch {
        return 0;
      }
    }

    // COUNTING: direct component lookup — no switch needed
    return components[category.stat_key] ?? 0;
  }

  private isLowerBetter(category: any): boolean {
    return category.direction === "LOWER_BETTER";
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

  private analyzeRosterDepth(
    roster: Array<{ player_id: number; positions: string[] }>,
    rosterSlots: Record<string, number>,
  ): Map<string, { count: number; slots: number; depthRatio: number }> {
    const depthMap = new Map<
      string,
      { count: number; slots: number; depthRatio: number }
    >();

    // Count eligible players for each position
    for (const [position, slots] of Object.entries(rosterSlots)) {
      // Skip bench, IL, and UTIL for depth analysis
      if (position === "BN" || position === "IL" || position === "UTIL") {
        continue;
      }

      let count = 0;
      for (const player of roster) {
        if (this.canFillSlot(player.positions, position)) {
          count++;
        }
      }

      const depthRatio = slots > 0 ? count / slots : 0;
      depthMap.set(position, { count, slots, depthRatio });
    }

    return depthMap;
  }

  private computePositionalBonus(
    givePositions: string[][],
    receivePositions: string[][],
    depthMap: Map<string, { count: number; slots: number; depthRatio: number }>,
  ): PositionalContext {
    // Identify positions of need (depth ratio < 1.5)
    const needPositions: string[] = [];
    for (const [position, depth] of depthMap.entries()) {
      if (depth.depthRatio < 1.5) {
        needPositions.push(position);
      }
    }

    // Extract primary positions (first in each array)
    const positionGained = receivePositions.map((positions) => positions[0] || "UTIL");
    const positionLost = givePositions.map((positions) => positions[0] || "UTIL");

    // Check if any received player fills a need
    let fillsNeed = false;
    for (const positions of receivePositions) {
      for (const position of positions) {
        if (needPositions.includes(position)) {
          fillsNeed = true;
          break;
        }
      }
      if (fillsNeed) break;
    }

    // Calculate positional bonus
    let positionalBonus = 0;

    for (let i = 0; i < receivePositions.length; i++) {
      const receivePrimary = receivePositions[i][0];
      if (!receivePrimary) continue;

      // Add scarcity bonus if filling a need
      const receiveFillsNeed = receivePositions[i].some((pos) =>
        needPositions.includes(pos),
      );
      if (receiveFillsNeed) {
        const scarcityMultiplier = POSITION_SCARCITY[receivePrimary] || 1.0;
        positionalBonus += scarcityMultiplier * 0.5;

        // Additional bonus if trading from depth
        if (i < givePositions.length) {
          const givePrimary = givePositions[i][0];
          if (givePrimary) {
            const giveDepth = depthMap.get(givePrimary);
            if (giveDepth && giveDepth.depthRatio > 2.5) {
              positionalBonus += 0.5;
            }
          }
        }
      }
    }

    // Cap total bonus at 3.0
    positionalBonus = Math.min(positionalBonus, 3.0);

    return {
      positionGained,
      positionLost,
      fillsNeed,
      needPositions,
      positionalBonus,
    };
  }

  private generateTradeExplanation(
    trade: ProposedTrade,
    deltaPoints: number,
    categoryImpacts: CategoryImpact[],
    positionalContext?: PositionalContext,
  ): string {
    const giveNames = trade.givePlayers.map((p) => p.playerName).join(", ");
    const receiveNames = trade.receivePlayers
      .map((p) => p.playerName)
      .join(", ");

    const significantImpacts = categoryImpacts
      .filter((impact) => Math.abs(impact.deltaPoints) >= 1)
      .sort((a, b) => Math.abs(b.deltaPoints) - Math.abs(a.deltaPoints))
      .slice(0, 3);

    let explanation = "";

    // Add positional context if available
    if (positionalContext?.fillsNeed) {
      const needsFilledByTrade = positionalContext.needPositions.filter((pos) =>
        positionalContext.positionGained.includes(pos),
      );
      if (needsFilledByTrade.length > 0) {
        explanation += `Fills a need at ${needsFilledByTrade.join(", ")}. `;
      }
    }

    explanation += `Trading ${giveNames} for ${receiveNames} would result in a ${deltaPoints > 0 ? "gain" : "loss"} of ${Math.abs(deltaPoints).toFixed(1)} overall roto points. `;

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

    // Add note if trading from depth
    if (positionalContext) {
      const deepPositions = positionalContext.positionLost.filter((pos) => {
        const depth = Array.from(
          this.analyzeRosterDepth([], {}).entries(),
        ).find(([p]) => p === pos);
        return depth && depth[1].depthRatio > 2.5;
      });
      if (deepPositions.length > 0) {
        explanation += ` Trading from a position of depth (${deepPositions.join(", ")}).`;
      }
    }

    return explanation;
  }
}
