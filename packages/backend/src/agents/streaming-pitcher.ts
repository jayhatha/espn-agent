import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { Category, StatComponents, ExternalRankingEntry } from "../../../shared/dist/index.js";
import { MLBStatsAPIAdapter, ProbablePitcherInfo } from "../adapters/mlb-statsapi.js";
import { normalizeName } from "./sit-start-advisor.js";
import { RotoballerAdapter } from "../adapters/rotoballer.js";

/**
 * Streaming Pitcher Agent
 *
 * Ranks available pitchers by matchup favorability using opponent strength,
 * park factors (approximated), and projections. Detects multi-start weeks.
 * Integrates Rotoballer verdicts and waiver pickup timing filters.
 */

export interface StreamingCandidate {
  playerId: number;
  playerName: string;
  mlbTeam: string;
  opponent: string;
  isHome: boolean;
  venue: string;
  gameDate: string;
  compositeScore: number;
  projectedStats: StatComponents; // RoS projection scaled to single start
  weekStarts: number; // Number of starts this week (2-start pitchers bonus)
  ownership: number | null; // ESPN ownership % if available
  scoreBreakdown: {
    projectionScore: number;
    opponentScore: number;
    multiStartBonus: number;
  };
  rotoballerVerdict?: "start" | "lean_start" | "neutral" | "lean_sit" | "sit";
  rotoballerGrade?: number;
  rotoballerSourceUrl?: string;
  pickupDeadline?: string; // ISO date string of latest Tue/Fri before gameDate
}

export interface StreamingResult {
  candidates: StreamingCandidate[];
  dateRange: { start: string; end: string };
  totalCandidates: number;
  rotoballerSource?: {
    articleTitle: string;
    articleUrl: string;
    scrapedAt: string;
  };
}

/**
 * Find the latest Tuesday (2) or Friday (5) strictly before the given game date.
 * Returns ISO date string or undefined if no valid pickup day exists
 * (e.g., game is today or tomorrow with no Tue/Fri in between).
 */
function getPickupDeadline(gameDate: string): string | undefined {
  const game = new Date(gameDate + "T00:00:00");
  // Walk backwards from day before game date
  const cursor = new Date(game);
  cursor.setDate(cursor.getDate() - 1);
  // Search up to 7 days back
  for (let i = 0; i < 7; i++) {
    const dow = cursor.getDay(); // 0=Sun, 2=Tue, 5=Fri
    if (dow === 2 || dow === 5) {
      return cursor.toISOString().split("T")[0];
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return undefined;
}

export class StreamingPitcherAgent {
  constructor(
    private db: Kysely<Database>,
    private mlbAdapter: MLBStatsAPIAdapter,
    private logger?: BaseLogger,
    private rotoballerAdapter?: RotoballerAdapter,
  ) {}

  async getRecommendations(
    leagueId: number,
    teamId: number,
    options?: {
      startDate?: string; // Default: today
      lookAheadDays?: number; // Default: 7
      limit?: number; // Default: 20
    }
  ): Promise<StreamingResult> {
    const {
      startDate = new Date().toISOString().split("T")[0],
      lookAheadDays = 7,
      limit = 20,
    } = options || {};

    // Calculate date range
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + lookAheadDays);
    const endDateStr = endDate.toISOString().split("T")[0];

    this.logger?.info(
      { leagueId, teamId, startDate, endDateStr, lookAheadDays },
      "Generating streaming pitcher recommendations",
    );

    // 1. Load league settings (need categories to score pitchers)
    const settings = await this.loadLeagueSettings(leagueId, startDate);
    if (!settings) {
      this.logger?.error({ leagueId }, "League settings not found");
      return {
        candidates: [],
        dateRange: { start: startDate, end: endDateStr },
        totalCandidates: 0,
      };
    }

    const categories = settings.settings_json.categories as Category[];

    // 2. Get probable pitchers for the date range
    const probablePitchers = await this.getProbablePitchersForRange(
      startDate,
      endDateStr
    );

    if (probablePitchers.length === 0) {
      this.logger?.warn({ startDate, endDateStr }, "No probable pitchers found");
      return {
        candidates: [],
        dateRange: { start: startDate, end: endDateStr },
        totalCandidates: 0,
      };
    }

    // 3. Get multi-start map
    const multiStartMap = await this.mlbAdapter.getMultiStartPitchers(
      startDate,
      endDateStr
    );

    // 3b. Fetch Rotoballer rankings (if adapter provided)
    let rotoballerRankings: ExternalRankingEntry[] = [];
    let rotoballerSource: StreamingResult["rotoballerSource"] = undefined;
    if (this.rotoballerAdapter) {
      try {
        rotoballerRankings = await this.rotoballerAdapter.getRankings();
        if (rotoballerRankings.length > 0) {
          const first = rotoballerRankings[0];
          rotoballerSource = {
            articleTitle: first.articleTitle,
            articleUrl: first.sourceUrl,
            scrapedAt: first.scrapedAt,
          };
        }
        this.logger?.info({ count: rotoballerRankings.length }, "Rotoballer rankings loaded for streaming filter");
      } catch (err) {
        this.logger?.warn({ error: err instanceof Error ? err.message : String(err) }, "Rotoballer fetch failed — skipping verdict filter");
      }
    }

    // 4. Load all rostered player IDs (to exclude from recommendations)
    const rosteredPlayerIds = await this.getRosteredPlayerIds(leagueId, startDate);

    // 5. Load pitcher projections
    const latestProjection = await this.db
      .selectFrom("projections_run")
      .select("id")
      .where("staleness", "=", "fresh")
      .orderBy("as_of_date", "desc")
      .executeTakeFirst();

    if (!latestProjection) {
      this.logger?.warn("No fresh projections available");
      return {
        candidates: [],
        dateRange: { start: startDate, end: endDateStr },
        totalCandidates: 0,
      };
    }

    const allProjections = await this.db
      .selectFrom("player_projection as pp")
      .innerJoin("player as p", "p.id", "pp.player_id")
      .select([
        "pp.player_id",
        "pp.stat_components_json",
        "p.name",
        "p.mlb_team",
      ])
      .where("pp.projections_run_id", "=", latestProjection.id)
      .execute();

    // Filter to pitcher projections only (have IP or K stats)
    const projections = allProjections.filter(p =>
      (p.stat_components_json.IP ?? 0) > 0 || (p.stat_components_json.K ?? 0) > 0
    );

    // 6. Match probable pitchers to projections
    const candidates: StreamingCandidate[] = [];

    for (const probable of probablePitchers) {
      // Fuzzy match pitcher name
      const projection = this.findMatchingProjection(
        probable.fullName,
        projections
      );

      if (!projection) continue;

      // Exclude rostered pitchers
      if (rosteredPlayerIds.has(projection.player_id)) continue;

      // Calculate scores
      const projectionScore = this.calculateProjectionScore(
        projection.stat_components_json,
        categories
      );

      const opponentScore = this.calculateOpponentScore(probable);

      // Multi-start bonus: check if pitcher's team has multiple games
      const teamGameCount = multiStartMap.get(projection.mlb_team || "") || 0;
      const multiStartBonus = teamGameCount >= 7 ? 15 : 0;

      const compositeScore = projectionScore + opponentScore + multiStartBonus;

      // Match to Rotoballer ranking
      const rbMatch = rotoballerRankings.find(
        (e) => normalizeName(e.playerName) === normalizeName(projection.name)
      );

      const pickupDeadline = getPickupDeadline(probable.gameDate);

      candidates.push({
        playerId: projection.player_id,
        playerName: projection.name,
        mlbTeam: projection.mlb_team || "Unknown",
        opponent: probable.opponent,
        isHome: probable.isHome,
        venue: probable.venue,
        gameDate: probable.gameDate,
        compositeScore,
        projectedStats: projection.stat_components_json,
        weekStarts: teamGameCount,
        ownership: null, // Could be populated from ESPN data
        scoreBreakdown: {
          projectionScore,
          opponentScore,
          multiStartBonus,
        },
        rotoballerVerdict: rbMatch?.verdict,
        rotoballerGrade: rbMatch?.grade,
        rotoballerSourceUrl: rbMatch?.sourceUrl,
        pickupDeadline,
      });
    }

    // 6b. Filter: must have a valid pickup deadline (Tue/Fri before game)
    let filtered = candidates.filter(c => c.pickupDeadline !== undefined);

    // 6c. Filter by Rotoballer verdict (only if rankings were available)
    if (rotoballerRankings.length > 0) {
      filtered = filtered.filter(c =>
        c.rotoballerVerdict === "start" || c.rotoballerVerdict === "lean_start"
      );
    }
    // If rotoballerRankings is empty, skip verdict filter per D-05 (graceful degradation)

    // 7. Sort by composite score and limit
    const sortedCandidates = filtered
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, limit);

    this.logger?.info(
      {
        totalProbablePitchers: probablePitchers.length,
        matchedToProjections: candidates.length,
        afterFilters: filtered.length,
        afterLimit: sortedCandidates.length,
      },
      "Streaming pitcher recommendations complete",
    );

    return {
      candidates: sortedCandidates,
      dateRange: { start: startDate, end: endDateStr },
      totalCandidates: filtered.length,
      rotoballerSource,
    };
  }

  private async loadLeagueSettings(leagueId: number, date: string) {
    return await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("effective_date", "<=", date)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();
  }

  private async getProbablePitchersForRange(
    startDate: string,
    endDate: string
  ): Promise<ProbablePitcherInfo[]> {
    const allPitchers: ProbablePitcherInfo[] = [];

    // Fetch probable pitchers for each day in range
    const currentDate = new Date(startDate);
    const finalDate = new Date(endDate);

    while (currentDate <= finalDate) {
      const dateStr = currentDate.toISOString().split("T")[0];
      const pitchers = await this.mlbAdapter.getProbablePitchers(dateStr);
      allPitchers.push(...pitchers);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return allPitchers;
  }

  private async getRosteredPlayerIds(
    leagueId: number,
    snapshotDate: string
  ): Promise<Set<number>> {
    const rostered = await this.db
      .selectFrom("team_roster_snapshot")
      .select("player_id")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    return new Set(rostered.map(r => r.player_id));
  }

  private findMatchingProjection(
    probablePitcherName: string,
    projections: Array<{
      player_id: number;
      stat_components_json: StatComponents;
      name: string;
      mlb_team: string | null;
    }>
  ) {
    const searchName = normalizeName(probablePitcherName);

    return projections.find(p => {
      const projName = normalizeName(p.name);
      return projName === searchName;
    });
  }

  private calculateProjectionScore(
    components: StatComponents,
    categories: Category[]
  ): number {
    let score = 0;

    // Per-start estimates (divide RoS by ~30 starts)
    const perStartIP = (components.IP || 0) / 30;
    const perStartK = (components.K || 0) / 30;
    const perStartER = (components.ER || 0) / 30;

    // K score: 2 points per strikeout (max ~20pts for elite 10K pitcher)
    if (categories.some(c => c.stat_key === "K")) {
      score += perStartK * 2;
    }

    // ERA bonus: (5.0 - projected_ERA) * 5 if under 5.0
    if (categories.some(c => c.stat_key === "ERA")) {
      const era = perStartIP > 0 ? (9 * perStartER) / perStartIP : 5.0;
      if (era < 5.0) {
        score += (5.0 - era) * 5;
      }
    }

    // WHIP bonus: approximated from components
    if (categories.some(c => c.stat_key === "WHIP")) {
      const perStartH = (components.HA || 0) / 30;
      const perStartBB = (components.BBA || 0) / 30;
      const whip = perStartIP > 0 ? (perStartH + perStartBB) / perStartIP : 2.0;
      if (whip < 2.0) {
        score += (2.0 - whip) * 10;
      }
    }

    return Math.min(score, 50); // Cap at 50 points
  }

  private calculateOpponentScore(probable: ProbablePitcherInfo): number {
    // Simplified opponent scoring
    // Since we don't have opponent batting stats in DB, use basic heuristics

    let score = 15; // Base score for being probable pitcher (announced)

    // Home pitchers get a small bonus (home field advantage)
    if (probable.isHome) {
      score += 5;
    }

    return Math.min(score, 30); // Cap at 30 points
  }
}
