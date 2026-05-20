import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { SnapshotRepository } from "../db/snapshot-repository.js";
import type { Category, StatComponents } from "../../../shared/dist/index.js";
import {
  calculateFinalRate,
  combineComponents,
  PITCHING_STAT_KEYS,
} from "../../../shared/dist/index.js";
import { assignRanksWithTies } from "../utils/roto-ranking.js";
import { allocateProjections } from "../projection/allocator.js";
import { computeRateConfidence } from "../projection/variance.js";
import type {
  AllocationInput,
  AllocationResult,
  RosteredPlayer,
  ConfidenceInterval,
} from "../projection/types.js";

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

const DEFAULT_GS_CAP = 200;

/**
 * Compute category projections from a completed allocation result.
 * Pure function — no DB access, no side effects. Safe to test in isolation.
 *
 * @param allocResult - Output from allocateProjections()
 * @param currentTotals - Season-to-date category rows for this team
 * @param categories - League category definitions
 * @param logger - Optional pino logger (only used on rate-stat exceptions)
 */
export function computeCategoryProjections(
  allocResult: AllocationResult,
  currentTotals: Array<{
    category_id: string;
    value: unknown;
    components_json: unknown;
  }>,
  categories: Category[],
  logger?: BaseLogger,
): Map<
  string,
  {
    value: number;
    components: StatComponents;
    isDegraded: boolean;
    confidence?: ConfidenceInterval;
  }
> {
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

    const isPitchingCat = PITCHING_STAT_KEYS.has(category.stat_key);
    const projectedComponents = isPitchingCat
      ? allocResult.pitcherComponents
      : allocResult.batterComponents;

    const confidenceMap = isPitchingCat
      ? allocResult.pitcherConfidence
      : allocResult.batterConfidence;

    if (category.type === "COUNTING") {
      const projectedSum = projectedComponents[category.stat_key] || 0;
      const currentValue = Number(currentTotal?.value || 0);
      const finalValue = currentValue + projectedSum;

      const ci = confidenceMap[category.stat_key];
      const confidence: ConfidenceInterval | undefined = ci
        ? {
            p10: currentValue + ci.p10,
            p50: finalValue,
            p90: currentValue + ci.p90,
          }
        : undefined;

      categoryProjections.set(category.category_id, {
        value: finalValue,
        components: {},
        isDegraded: false,
        confidence,
      });
    } else if (category.type === "RATE") {
      const currentComponents = (currentTotal?.components_json ||
        {}) as StatComponents;
      const denominatorKey = isPitchingCat ? "IP" : "AB";
      const projectedDenominator =
        (projectedComponents[denominatorKey] as number) ?? 0;

      if (projectedDenominator <= 0) {
        categoryProjections.set(category.category_id, {
          value: Number(currentTotal?.value ?? 0),
          components: currentComponents,
          isDegraded: true,
        });
      } else {
        try {
          const finalValue = calculateFinalRate(
            category.formula_id || category.stat_key.toLowerCase(),
            currentComponents,
            projectedComponents,
          );

          const combinedComponents = combineComponents(
            currentComponents,
            projectedComponents,
          );

          const formulaId =
            category.formula_id || category.stat_key.toLowerCase();
          const rateFn = (c: StatComponents) => {
            try {
              return calculateFinalRate(formulaId, {}, c);
            } catch {
              return 0;
            }
          };
          const componentKeys = Object.keys(projectedComponents).filter(
            (k) =>
              typeof projectedComponents[k] === "number" &&
              (projectedComponents[k] as number) > 0,
          );
          const rateCI = computeRateConfidence(
            combinedComponents,
            rateFn,
            componentKeys,
          );

          categoryProjections.set(category.category_id, {
            value: finalValue,
            components: combinedComponents,
            isDegraded: false,
            confidence: rateCI,
          });
        } catch (error) {
          logger?.warn(
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
  }

  return categoryProjections;
}

export class StandingsProjectionAgent {
  private readonly repo: SnapshotRepository;

  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {
    this.repo = new SnapshotRepository(db);
  }

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
    const rosterSlots =
      ((settings.settings_json as any).roster_slots as Record<
        string,
        number
      >) || {};

    // Get all teams
    const teams = await this.db
      .selectFrom("team")
      .selectAll()
      .where("league_id", "=", leagueId)
      .execute();

    // Fetch shared data once for all teams (parallel)
    const [
      projectionAsOfDate,
      gsCap,
      latestPayload,
      teamEspnIds,
      allCategoryTotals,
      allRosterEntries,
      allProjections,
    ] = await Promise.all([
      this.getProjectionAsOfDate(projectionsRunId),
      this.getGsCap(leagueId),
      this.db
        .selectFrom("league_raw_payload")
        .select(["response_json"])
        .where("league_id", "=", leagueId)
        .orderBy("fetched_at", "desc")
        .executeTakeFirst(),
      this.db
        .selectFrom("team")
        .select(["id", "espn_team_id"])
        .where("league_id", "=", leagueId)
        .execute(),
      // Pre-fetch ALL category totals for the league+date in one query
      this.repo.getLeagueCategoryTotals(leagueId, snapshotDate),
      // Pre-fetch ALL roster entries for the league+date in one query
      this.repo.getRosterForSnapshot(leagueId, snapshotDate),
      // Pre-fetch ALL player projections for this run in one query
      this.repo.getPlayerProjections(projectionsRunId),
    ]);

    // Group category totals by team_id
    const categoryTotalsByTeam = new Map<number, typeof allCategoryTotals>();
    for (const row of allCategoryTotals) {
      const existing = categoryTotalsByTeam.get(row.team_id) ?? [];
      existing.push(row);
      categoryTotalsByTeam.set(row.team_id, existing);
    }

    // Group roster entries by team_id
    const rosterByTeam = new Map<number, typeof allRosterEntries>();
    for (const row of allRosterEntries) {
      const existing = rosterByTeam.get(row.team_id) ?? [];
      existing.push(row);
      rosterByTeam.set(row.team_id, existing);
    }

    // Index all projections by player_id
    const projectionsByPlayerId = new Map<number, StatComponents>();
    for (const proj of allProjections) {
      projectionsByPlayerId.set(
        proj.player_id,
        proj.stat_components_json as StatComponents,
      );
    }

    // Batch extract GS used per team from single ESPN payload (0 extra queries)
    const espnIdMap = new Map(teamEspnIds.map((t) => [t.id, t.espn_team_id]));
    const gsUsedByTeam = new Map<number, number>();
    const rawPayload = latestPayload?.response_json as any;
    for (const team of teams) {
      const espnTeamId = espnIdMap.get(team.id);
      const espnTeam = rawPayload?.teams?.find((t: any) => t.id === espnTeamId);
      const gs = espnTeam?.valuesByStat?.[33];
      gsUsedByTeam.set(team.id, typeof gs === "number" && gs >= 0 ? gs : 0);
    }

    // Compute projections for each team in parallel (pure — no DB calls per team)
    const teamProjections = await Promise.all(
      teams.map((team) =>
        this.computeTeamProjection(
          team.id,
          categories,
          rosterSlots,
          gsUsedByTeam.get(team.id) ?? 0,
          gsCap,
          projectionAsOfDate,
          snapshotDate,
          categoryTotalsByTeam,
          rosterByTeam,
          projectionsByPlayerId,
        ),
      ),
    );

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
   * Compute projected totals for a single team using pre-fetched league data.
   * Pure over pre-loaded structures — makes no DB calls.
   */
  private async computeTeamProjection(
    teamId: number,
    categories: Category[],
    rosterSlots: Record<string, number>,
    gsUsed: number,
    gsCap: number,
    projectionAsOfDate: string,
    snapshotDate: string,
    categoryTotalsByTeam: Map<
      number,
      Array<{
        team_id: number;
        category_id: string;
        value: unknown;
        components_json: unknown;
      }>
    >,
    rosterByTeam: Map<
      number,
      Array<{
        team_id: number;
        player_id: number;
        roster_status: string | null;
        roster_slot: string | null;
        positions: unknown;
      }>
    >,
    allProjectionsByPlayerId: Map<number, StatComponents>,
  ): Promise<TeamProjection> {
    const currentTotals = categoryTotalsByTeam.get(teamId) ?? [];
    const roster = rosterByTeam.get(teamId) ?? [];

    // Slice projections for this team's roster from the league-wide map
    const projectionsByPlayerId = new Map<number, StatComponents>();
    for (const r of roster) {
      const proj = allProjectionsByPlayerId.get(r.player_id);
      if (proj) projectionsByPlayerId.set(r.player_id, proj);
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

    const categoryProjections = computeCategoryProjections(
      allocResult,
      currentTotals,
      categories,
      this.logger,
    );

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
      const rosterSlots = json.roster_slots as
        | Record<string, number>
        | undefined;
      if (rosterSlots?.GS_LIMIT !== undefined) {
        return rosterSlots.GS_LIMIT;
      }
    }

    return DEFAULT_GS_CAP;
  }

  /**
   * Get the as_of_date for a projections run (for staleness prorating)
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
}
