import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { SnapshotRepository } from "../db/snapshot-repository.js";
import type { Category, StatComponents } from "../../../shared/dist/index.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { RosterSimulator, type AddDropSimContext } from "./roster-simulator.js";
import { ESPNAdapter } from "../adapters/espn.js";
import type { RosteredPlayer, RosterGap } from "../projection/types.js";
import type { ScenarioEvaluationAgent } from "./scenario-evaluation.js";

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
  blockingIssues?: string[];
  rosterGaps?: RosterGap[]; // Roster gaps detected in post-add roster via allocateProjections
}

/** Input to the dedicated exact add/drop evaluation path (Phase 108). */
export interface WaiverEvaluationInput {
  leagueId: number;
  teamId: number;
  snapshotDate: string;
  projectionsRunId: number;
  addPlayerId: number;
  dropPlayerId: number;
}

/** Result from the dedicated exact add/drop evaluation path (Phase 108). */
export interface WaiverEvaluationResult {
  isLegal: boolean;
  blockingIssues: string[];
  gaps: RosterGap[];
  deltaOverallPoints: number;
  categoryDeltas: Record<string, number>;
  degradedReasons: string[];
}

export class WaiverRecommendationAgent {
  private readonly repo: SnapshotRepository;
  private readonly simulator: RosterSimulator;

  constructor(
    private db: Kysely<Database>,
    // @ts-expect-error reserved for future standings-based scoring
    private standingsAgent: StandingsProjectionAgent,
    private espnAdapter: ESPNAdapter,
    private logger?: BaseLogger,
    private scenarioEvaluationAgent?: ScenarioEvaluationAgent,
  ) {
    this.repo = new SnapshotRepository(db);
    this.simulator = new RosterSimulator();
  }

  /**
   * Dedicated exact add/drop evaluation path (Phase 108).
   *
   * Uses ScenarioEvaluationAgent for legality and scoring rather than the
   * heuristic canReplacePosition() gate. Falls back to resolving
   * projectionsRunId from the snapshot row if not provided directly.
   */
  async evaluateAddDropImpact(
    input: WaiverEvaluationInput,
  ): Promise<WaiverEvaluationResult> {
    const evaluator = this.scenarioEvaluationAgent;
    if (!evaluator) {
      // Degrade gracefully if the evaluator is not wired
      return {
        isLegal: false,
        blockingIssues: ["ScenarioEvaluationAgent not configured"],
        gaps: [],
        deltaOverallPoints: 0,
        categoryDeltas: {},
        degradedReasons: ["evaluator_not_configured"],
      };
    }

    const result = await evaluator.evaluateWaiver({
      leagueId: input.leagueId,
      teamId: input.teamId,
      snapshotDate: input.snapshotDate,
      projectionsRunId: input.projectionsRunId,
      addPlayerId: input.addPlayerId,
      dropPlayerId: input.dropPlayerId,
    });

    return {
      isLegal: result.isLegal,
      blockingIssues: result.blockingIssues,
      gaps: result.gaps,
      deltaOverallPoints: result.deltaOverallPoints,
      categoryDeltas: result.categoryDeltas,
      degradedReasons: result.degradedReasons,
    };
  }

  /**
   * Get waiver recommendations for a team.
   *
   * Pass freeAgentPlayerIds to override the pool (e.g. evaluate a specific add).
   * Otherwise the agent resolves the pool internally via the snapshot repository
   * with fallback to parsing the latest raw ESPN payload.
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
    const roster = await this.repo.getRosterForSnapshot(
      leagueId,
      snapshotDate,
      teamId,
    );

    // Resolve free agent pool — caller may supply override (e.g. for evaluate endpoint)
    let freeAgents: number[];
    if (freeAgentPlayerIds) {
      freeAgents = freeAgentPlayerIds;
    } else {
      // Primary: league_free_agent_snapshot table (populated during snapshot)
      freeAgents = await this.repo.getFreeAgentsForSnapshot(
        leagueId,
        snapshotDate,
      );

      if (freeAgents.length === 0) {
        // Fallback: parse from latest raw ESPN payload (for old snapshots)
        const latestPayload = await this.db
          .selectFrom("league_raw_payload")
          .select("response_json")
          .where("league_id", "=", leagueId)
          .orderBy("fetched_at", "desc")
          .executeTakeFirst();

        if (latestPayload) {
          const normalized = this.espnAdapter.normalizeLeagueData(
            latestPayload.response_json as Record<string, unknown>,
          );
          const espnPlayerIds =
            normalized.freeAgents?.map((fa) => fa.playerId) || [];
          if (espnPlayerIds.length > 0) {
            const freeAgentPlayers = await this.db
              .selectFrom("player")
              .select("id")
              .where("id", "in", espnPlayerIds)
              .execute();
            freeAgents = freeAgentPlayers.map((p) => p.id);
          }
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

    // Fetch snapshot + settings via repository
    const snapshot = await this.repo.getLeagueSettings(leagueId, snapshotDate);
    const snapshotRow = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirst();

    if (!snapshotRow || !snapshotRow.projections_run_id) {
      this.logger?.warn(
        { leagueId, snapshotDate },
        "No snapshot or projections run found",
      );
      return [];
    }

    if (!snapshot) {
      this.logger?.warn({ leagueId }, "No settings version found");
      return [];
    }

    const categories = snapshot.settings_json.categories as Category[];

    // Fetch projected standings via repository
    const allCategoryProjections = await this.repo.getProjectedCategory(
      leagueId,
      snapshotDate,
    );
    const currentProjections = allCategoryProjections.filter(
      (p) => p.team_id === teamId,
    );
    const allTeamsProjections = allCategoryProjections;

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
        this.repo.getPlayerProjections(
          snapshotRow.projections_run_id,
          allPlayerIds,
        ),
      ]);

      for (const player of players) {
        playerMap.set(player.id, player);
      }
      for (const proj of projections) {
        projectionMap.set(proj.player_id, proj);
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

    const addDropCtx: AddDropSimContext = {
      categories,
      currentProjections,
      allTeamsProjections,
      numTeams,
      teamId,
    };

    for (const { id: addPlayerId } of scoredFreeAgents) {
      if (recommendations.length >= TARGET_RECS) break; // Early exit

      for (const rosterPlayer of roster) {
        const dropPlayerId = rosterPlayer.player_id;

        // Skip if same player
        if (addPlayerId === dropPlayerId) continue;

        // Simulate swap and compute delta
        const delta = this.simulator.simulateAddDrop(
          addDropCtx,
          addPlayerId,
          dropPlayerId,
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
              explanation: this.simulator.generateAddDropExplanation(delta),
              topCategoryLabel: this.simulator.generateTopCategoryLabel(
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
      ((snapshot.settings_json as any).roster_slots as Record<
        string,
        number
      >) || {};
    const [{ gsUsed, gsCap }, projectionAsOfDate] = await Promise.all([
      this.getGsData(leagueId, teamId),
      this.getProjectionAsOfDate(snapshotRow.projections_run_id),
    ]);

    for (const rec of topN) {
      const postSwapPlayerIds = roster
        .map((r) => r.player_id)
        .filter((id) => id !== rec.dropPlayerId);
      postSwapPlayerIds.push(rec.addPlayerId);

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

      rec.rosterGaps = this.simulator.detectGaps({
        roster: rosterPlayers,
        rosterSlots,
        projectionsByPlayerId,
        gsUsed,
        gsCap,
        projectionAsOfDate,
        snapshotDate,
      });
    }

    return topN;
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
