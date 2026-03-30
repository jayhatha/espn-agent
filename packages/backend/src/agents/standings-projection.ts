import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { Category, StatComponents } from "../../../shared/dist/index.js";
import { calculateFinalRate, combineComponents } from "../../../shared/dist/index.js";
import { assignRanksWithTies } from "../utils/roto-ranking.js";
import { allocateProjections } from "../projection/allocator.js";
import { computeRateConfidence } from "../projection/variance.js";
import type { AllocationInput, RosteredPlayer, ConfidenceInterval } from "../projection/types.js";

/**
 * Standings Projection Agent
 * Per AGENTS.md §4
 *
 * Computes projected final totals, ranks, and overall standings
 * using component-based math for rate stats
 */

interface TeamProjection {
  teamId: number;
  categoryProjections: Map<
    string,
    {
      value: number;
      components: StatComponents;
      isDegraded: boolean;
      confidence?: ConfidenceInterval;
    }
  >;
}

/** Stat keys that belong to pitching categories */
const PITCHING_STAT_KEYS = new Set([
  // Pitching counting stats
  "K", "W", "L", "SV", "HLD", "QS", "CG", "BLSV", "SVO",
  "ER", "OUTS", "HA", "BBA", "HRA",
  // Pitching rate stats
  "ERA", "WHIP", "K9", "WPCT",
]);

const DEFAULT_GS_CAP = 200;

export class StandingsProjectionAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {}

  /**
   * Compute projected standings for a snapshot
   */
  async computeProjectedStandings(
    leagueId: number,
    snapshotDate: string,
    projectionsRunId: number,
  ): Promise<void> {
    this.logger?.info(
      { leagueId, snapshotDate, projectionsRunId },
      "Computing projected standings",
    );

    // Get snapshot and settings
    const snapshot = await this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .executeTakeFirstOrThrow();

    const settings = await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("id", "=", snapshot.settings_version_id)
      .executeTakeFirstOrThrow();

    const categories = settings.settings_json.categories as Category[];
    const rosterSlots = (settings.settings_json as any).roster_slots as Record<string, number> || {};

    // Get all teams
    const teams = await this.db
      .selectFrom("team")
      .selectAll()
      .where("league_id", "=", leagueId)
      .execute();

    // Fetch projection as_of_date and GS cap once for all teams
    const projectionAsOfDate = await this.getProjectionAsOfDate(projectionsRunId);
    const gsCap = await this.getGsCap(leagueId);

    // Compute projections for each team (sequentially to avoid DB overload)
    const teamProjections: TeamProjection[] = [];
    for (const team of teams) {
      const gsUsed = await this.getGsUsed(leagueId, team.id);
      const projection = await this.computeTeamProjection(
        leagueId,
        snapshotDate,
        team.id,
        projectionsRunId,
        categories,
        rosterSlots,
        gsUsed,
        gsCap,
        projectionAsOfDate,
      );
      teamProjections.push(projection);
    }

    // Rank teams by category and compute roto points
    await this.rankAndStore(
      leagueId,
      snapshotDate,
      teamProjections,
      categories,
    );

    this.logger?.info(
      { leagueId, snapshotDate },
      "Projected standings computed",
    );
  }

  /**
   * Compute projected totals for a single team using allocateProjections
   */
  private async computeTeamProjection(
    leagueId: number,
    snapshotDate: string,
    teamId: number,
    projectionsRunId: number,
    categories: Category[],
    rosterSlots: Record<string, number>,
    gsUsed: number,
    gsCap: number,
    projectionAsOfDate: string,
  ): Promise<TeamProjection> {
    // Get current totals with components
    const currentTotals = await this.db
      .selectFrom("team_daily_category_totals")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .where("team_id", "=", teamId)
      .execute();

    // Get roster with player positions (join player table)
    const roster = await this.db
      .selectFrom("team_roster_snapshot as r")
      .innerJoin("player as p", "p.id", "r.player_id")
      .select([
        "r.player_id",
        "r.roster_status",
        "r.roster_slot",
        "p.positions",
      ])
      .where("r.league_id", "=", leagueId)
      .where("r.snapshot_date", "=", snapshotDate)
      .where("r.team_id", "=", teamId)
      .execute();

    // Get projections for roster players
    const playerIds = roster.map((r) => r.player_id);
    const projections =
      playerIds.length > 0
        ? await this.db
            .selectFrom("player_projection")
            .selectAll()
            .where("projections_run_id", "=", projectionsRunId)
            .where("player_id", "in", playerIds)
            .execute()
        : [];

    // Build projectionsByPlayerId map for the allocator
    const projectionsByPlayerId = new Map<number, StatComponents>();
    for (const proj of projections) {
      projectionsByPlayerId.set(proj.player_id, proj.stat_components_json as StatComponents);
    }

    // Build RosteredPlayer array for the allocator
    const rosterPlayers: RosteredPlayer[] = roster.map((r) => ({
      playerId: r.player_id,
      positions: (r.positions as string[]) || [],
      rosterStatus: (r.roster_status as "active" | "bench" | "il") || "active",
      rosterSlot: r.roster_slot || null,
      projectedComponents: null, // filled by allocator from projectionsByPlayerId
    }));

    // Run the allocation pipeline (lineup constraints + GS cap + staleness prorating)
    const allocationInput: AllocationInput = {
      roster: rosterPlayers,
      rosterSlots,
      projectionsByPlayerId,
      gsUsed,
      gsCap,
      projectionAsOfDate,
      snapshotDate,
    };

    const allocResult = allocateProjections(allocationInput);

    this.logger?.debug(
      {
        teamId,
        gsUsed,
        gsCap,
        gsScaleFactor: allocResult.gsScaleFactor,
        prorateFactor: allocResult.prorateFactor,
        gapCount: allocResult.gaps.length,
      },
      "Allocation result for team",
    );

    const categoryProjections = new Map<
      string,
      {
        value: number;
        components: StatComponents;
        isDegraded: boolean;
        confidence?: ConfidenceInterval;
      }
    >();

    for (const category of categories) {
      const currentTotal = currentTotals.find(
        (t) => t.category_id === category.category_id,
      );

      // Use the allocated components (pitcher vs batter split done by allocator)
      const isPitchingCat = PITCHING_STAT_KEYS.has(category.stat_key);
      const projectedComponents = isPitchingCat
        ? allocResult.pitcherComponents
        : allocResult.batterComponents;

      // Get confidence interval for this stat from allocator
      const confidenceMap = isPitchingCat
        ? allocResult.pitcherConfidence
        : allocResult.batterConfidence;

      if (category.type === "COUNTING") {
        // Current totals + allocated projected counting stats
        const projectedSum = projectedComponents[category.stat_key] || 0;
        const currentValue = Number(currentTotal?.value || 0);
        const finalValue = currentValue + projectedSum;

        // Build confidence interval: current (fixed) + projected range
        const ci = confidenceMap[category.stat_key];
        const confidence: ConfidenceInterval | undefined = ci
          ? { p10: currentValue + ci.p10, p50: finalValue, p90: currentValue + ci.p90 }
          : undefined;

        categoryProjections.set(category.category_id, {
          value: finalValue,
          components: {},
          isDegraded: false,
          confidence,
        });
      } else if (category.type === "RATE") {
        // Component-based rate: combine current actuals + allocated projected components
        const currentComponents = (currentTotal?.components_json ||
          {}) as StatComponents;

        try {
          const finalValue = calculateFinalRate(
            category.formula_id || category.stat_key.toLowerCase(),
            currentComponents,
            projectedComponents,
          );

          const combinedComponents = combineComponents(currentComponents, projectedComponents);

          // Compute rate stat confidence by varying components
          const formulaId = category.formula_id || category.stat_key.toLowerCase();
          const rateFn = (c: StatComponents) => {
            try { return calculateFinalRate(formulaId, {}, c); } catch { return 0; }
          };
          const componentKeys = Object.keys(projectedComponents).filter(
            (k) => typeof projectedComponents[k] === "number" && (projectedComponents[k] as number) > 0,
          );
          const rateCI = computeRateConfidence(combinedComponents, rateFn, componentKeys);

          categoryProjections.set(category.category_id, {
            value: finalValue,
            components: combinedComponents,
            isDegraded: false,
            confidence: rateCI,
          });
        } catch (error) {
          this.logger?.warn(
            { category: category.category_id, error },
            "Failed to calculate rate stat, marking degraded",
          );

          categoryProjections.set(category.category_id, {
            value: Number(currentTotal?.value || 0),
            components: currentComponents,
            isDegraded: true,
          });
        }
      }
    }

    return {
      teamId,
      categoryProjections,
    };
  }

  /**
   * Rank teams and store projected standings
   */
  private async rankAndStore(
    leagueId: number,
    snapshotDate: string,
    teamProjections: TeamProjection[],
    categories: Category[],
  ): Promise<void> {
    // Delete existing projected standings for this snapshot
    await this.db
      .deleteFrom("team_daily_projected_category")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    await this.db
      .deleteFrom("team_daily_projected_overall")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    // Rank by category
    const teamOverallPoints = new Map<number, number>();

    for (const category of categories) {
      const values = teamProjections.map((tp) => {
        const catProj = tp.categoryProjections.get(category.category_id);
        return {
          teamId: tp.teamId,
          value: catProj?.value || 0,
          components: catProj?.components || {},
          confidence: catProj?.confidence || undefined,
        };
      });

      // Sort by direction
      values.sort((a, b) => {
        if (category.direction === "HIGHER_BETTER") {
          return b.value - a.value;
        } else {
          return a.value - b.value;
        }
      });

      // Assign ranks and roto points with tie handling
      const numTeams = values.length;
      const sorted = values.map((v) => ({ teamId: v.teamId, value: v.value }));
      const ranked = assignRanksWithTies(sorted, numTeams);

      // Build a lookup from teamId to rank info
      const rankMap = new Map(ranked.map((r) => [r.teamId, r]));

      // Build array for batch insert
      const categoryRows = [];
      for (let i = 0; i < values.length; i++) {
        const rankInfo = rankMap.get(values[i].teamId)!;
        const { rank, rotoPoints } = rankInfo;

        const currentPoints = teamOverallPoints.get(values[i].teamId) || 0;
        teamOverallPoints.set(values[i].teamId, currentPoints + rotoPoints);

        // Store components + confidence intervals in JSONB column
        const componentsWithConfidence = values[i].confidence
          ? { ...values[i].components, confidence: values[i].confidence }
          : values[i].components;

        categoryRows.push({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          team_id: values[i].teamId,
          category_id: category.category_id,
          projected_value: values[i].value,
          projected_rank: rank,
          projected_roto_points: rotoPoints,
          projected_components_json: componentsWithConfidence as StatComponents,
        });
      }

      // Batch insert category projections
      if (categoryRows.length > 0) {
        await this.db
          .insertInto("team_daily_projected_category")
          .values(categoryRows)
          .execute();
      }
    }

    // Rank overall
    const overallRankings = Array.from(teamOverallPoints.entries())
      .map(([teamId, points]) => ({ teamId, points }))
      .sort((a, b) => b.points - a.points);

    // Batch insert overall projections
    if (overallRankings.length > 0) {
      await this.db
        .insertInto("team_daily_projected_overall")
        .values(
          overallRankings.map((ranking, i) => ({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            team_id: ranking.teamId,
            projected_overall_points: ranking.points,
            projected_overall_rank: i + 1,
          })),
        )
        .execute();
    }
  }

  /**
   * Get GS already used by this team from ESPN raw payload or fallback to 0
   */
  private async getGsUsed(leagueId: number, teamId: number): Promise<number> {
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
          return gsFromEspn;
        }
      }
    }

    // Fallback: return 0 (conservative -- lets GS cap apply fully)
    return 0;
  }

  /**
   * Get GS cap for the league from settings or use default 200
   */
  private async getGsCap(leagueId: number): Promise<number> {
    const settings = await this.db
      .selectFrom("league_settings_version")
      .select("settings_json")
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    if (settings?.settings_json) {
      const json = settings.settings_json as unknown as Record<string, unknown>;
      const rosterSlots = json.roster_slots as Record<string, number> | undefined;
      if (rosterSlots?.GS_LIMIT !== undefined) {
        return rosterSlots.GS_LIMIT;
      }
    }

    return DEFAULT_GS_CAP;
  }

  /**
   * Get the as_of_date for a projections run (for staleness prorating)
   */
  private async getProjectionAsOfDate(projectionsRunId: number): Promise<string> {
    const run = await this.db
      .selectFrom("projections_run")
      .select("as_of_date")
      .where("id", "=", projectionsRunId)
      .executeTakeFirstOrThrow();
    return run.as_of_date;
  }
}
