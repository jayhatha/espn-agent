import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { assignRanksWithTies } from "../utils/roto-ranking.js";

/**
 * StandingsSwingAttributionAgent
 *
 * Decomposes a team's projected roto point delta between two snapshot dates
 * into three causal buckets:
 *   1. actual_performance  — YTD stat accumulation (team played games)
 *   2. projection_change   — new FanGraphs CSV uploaded (prevRunId !== currRunId)
 *   3. competitor_movement — residual: other teams' values shifted relative rank
 *
 * No new DB tables required — queries existing:
 *   team_daily_projected_category, team_daily_category_totals,
 *   team_daily_projected_overall, league_daily_snapshot, player_projection,
 *   team_roster_snapshot, player, team
 */

// ─── Exported interfaces ────────────────────────────────────────────────────

export interface CategoryAttribution {
  category_id: string;
  categoryName: string;
  prevProjectedValue: number;
  currProjectedValue: number;
  prevRotoPoints: number;
  currRotoPoints: number;
  rotoDelta: number;
  bucket: "actual_performance" | "projection_change" | "competitor_movement" | "mixed";
  topDriverPlayer?: string;
  topCompetitorMoved?: string;
}

export interface SwingAttributionResult {
  snapshotDate: string;
  previousSnapshotDate: string | null;
  attribution_available: boolean;
  teamId: number;
  teamName: string;
  totalDelta: number;
  buckets: {
    actual_performance: number;
    projection_change: number;
    competitor_movement: number;
  } | null;
  categoryBreakdown: CategoryAttribution[];
}

// ─── Pure helper functions (exported for unit testing) ──────────────────────

/**
 * Compute the roto point delta for myTeam in one category attributable to
 * YTD actual stat accumulation (prevActuals → currActuals).
 *
 * Algorithm:
 * 1. Compute prevRotoPoints: rank myTeam among allPrevProjected
 * 2. Build hypotheticalProjected: for each team,
 *      prevProjected[team] + (currActuals[team] - prevActuals[team])
 *    This applies ONLY the actual-accumulation component, holding RoS forecasts fixed.
 * 3. Rank myTeam in hypotheticalProjected → hypotheticalRotoPoints
 * 4. actualDelta = hypotheticalRotoPoints - prevRotoPoints
 *
 * Returns both actualDelta and the hypotheticalProjected map so
 * computeProjectionChangeDelta can continue the attribution chain.
 *
 * Pitfall 4 guard: actual contribution = currActuals - prevActuals, NOT all of
 * projected delta. Projected final total grows naturally with actual accumulation
 * even with zero projection change.
 */
export function computeActualPerformanceDelta(
  prevActuals: Map<number, number>,     // teamId → YTD actual at prevDate
  currActuals: Map<number, number>,     // teamId → YTD actual at currDate
  allPrevProjected: Map<number, number>, // teamId → projected_value at prevDate
  direction: "HIGHER_BETTER" | "LOWER_BETTER",
  numTeams: number,
  myTeamId: number,
): { actualDelta: number; hypotheticalProjected: Map<number, number> } {
  // Build hypotheticalProjected: prevProjected shifted by actual accumulation
  const hypothetical = new Map<number, number>();
  for (const [teamId, prevProj] of allPrevProjected.entries()) {
    const actualDiff = (currActuals.get(teamId) ?? 0) - (prevActuals.get(teamId) ?? 0);
    hypothetical.set(teamId, prevProj + actualDiff);
  }

  // Sort and rank prevProjected
  const prevSorted = [...allPrevProjected.entries()]
    .map(([teamId, value]) => ({ teamId, value }))
    .sort((a, b) =>
      direction === "HIGHER_BETTER" ? b.value - a.value : a.value - b.value,
    );
  const prevRanked = assignRanksWithTies(prevSorted, numTeams);
  const prevPts = prevRanked.find((r) => r.teamId === myTeamId)?.rotoPoints ?? 0;

  // Sort and rank hypothetical
  const hypSorted = [...hypothetical.entries()]
    .map(([teamId, value]) => ({ teamId, value }))
    .sort((a, b) =>
      direction === "HIGHER_BETTER" ? b.value - a.value : a.value - b.value,
    );
  const hypRanked = assignRanksWithTies(hypSorted, numTeams);
  const hypPts = hypRanked.find((r) => r.teamId === myTeamId)?.rotoPoints ?? 0;

  return { actualDelta: hypPts - prevPts, hypotheticalProjected: hypothetical };
}

/**
 * Compute the roto point delta for myTeam in one category attributable to
 * RoS projection changes (new FanGraphs CSV uploaded).
 *
 * Algorithm:
 * 1. Guard: if sameRunId, return 0 immediately (Pitfall 5)
 * 2. Rank myTeam in hypotheticalProjected (output of computeActualPerformanceDelta)
 * 3. Rank myTeam in allCurrProjected (final actual + new projection)
 * 4. projectionDelta = currRotoPoints - hypotheticalRotoPoints
 *
 * This correctly isolates the forecast-change component by using the
 * hypothetical state (after actual accumulation only) as the baseline.
 */
export function computeProjectionChangeDelta(
  hypotheticalProjected: Map<number, number>, // output from computeActualPerformanceDelta
  allCurrProjected: Map<number, number>,      // teamId → projected_value at currDate
  direction: "HIGHER_BETTER" | "LOWER_BETTER",
  numTeams: number,
  myTeamId: number,
  sameRunId: boolean,
): number {
  // Pitfall 5 guard: no projection change when same run ID
  if (sameRunId) return 0;

  // Rank hypothetical
  const hypSorted = [...hypotheticalProjected.entries()]
    .map(([teamId, value]) => ({ teamId, value }))
    .sort((a, b) =>
      direction === "HIGHER_BETTER" ? b.value - a.value : a.value - b.value,
    );
  const hypRanked = assignRanksWithTies(hypSorted, numTeams);
  const hypPts = hypRanked.find((r) => r.teamId === myTeamId)?.rotoPoints ?? 0;

  // Rank currProjected
  const currSorted = [...allCurrProjected.entries()]
    .map(([teamId, value]) => ({ teamId, value }))
    .sort((a, b) =>
      direction === "HIGHER_BETTER" ? b.value - a.value : a.value - b.value,
    );
  const currRanked = assignRanksWithTies(currSorted, numTeams);
  const currPts = currRanked.find((r) => r.teamId === myTeamId)?.rotoPoints ?? 0;

  return currPts - hypPts;
}

/**
 * Compute the competitor-movement bucket as a residual.
 * This captures roto point delta that is not explained by actual accumulation
 * or projection changes — i.e., other teams' values shifted this team's rank.
 */
export function attributeCompetitorMovement(
  total: number,
  actual: number,
  projection: number,
): number {
  return total - actual - projection;
}

// ─── Agent class ────────────────────────────────────────────────────────────

export class StandingsSwingAttributionAgent {
  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {}

  /**
   * Compute attribution for myTeam's projected roto point swing
   * between the most recent previous snapshot and currDate.
   *
   * Returns attribution_available: false when only one snapshot exists.
   */
  async computeSwing(
    leagueId: number,
    teamId: number,
    currDate: string,
  ): Promise<SwingAttributionResult> {
    this.logger?.info(
      { leagueId, teamId, currDate },
      "Computing standings swing attribution",
    );

    // ── Fetch current snapshot and team name ───────────────────────────────
    const [currSnapshotRow, teamRow] = await Promise.all([
      this.db
        .selectFrom("league_daily_snapshot")
        .select(["snapshot_date", "projections_run_id"])
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", currDate)
        .executeTakeFirst(),
      this.db
        .selectFrom("team")
        .select(["name"])
        .where("id", "=", teamId)
        .executeTakeFirst(),
    ]);

    // ── Find previous snapshot date ────────────────────────────────────────
    const prevSnapshotRow = await this.db
      .selectFrom("league_daily_snapshot")
      .select(["snapshot_date", "projections_run_id"])
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "<", currDate)
      .orderBy("snapshot_date", "desc")
      .executeTakeFirst();

    // Guard: no previous snapshot → attribution unavailable (Pitfall 2)
    if (!prevSnapshotRow) {
      return {
        snapshotDate: currDate,
        previousSnapshotDate: null,
        attribution_available: false,
        teamId,
        teamName: teamRow?.name ?? `Team ${teamId}`,
        totalDelta: 0,
        buckets: null,
        categoryBreakdown: [],
      };
    }

    const prevDate = prevSnapshotRow.snapshot_date;
    const prevRunId = prevSnapshotRow.projections_run_id;
    const currRunId = currSnapshotRow?.projections_run_id ?? null;
    // Pitfall 5 guard: same run ID = no projection change component
    const sameRunId = prevRunId !== null && currRunId !== null && prevRunId === currRunId;

    // ── Fetch all teams and settings ───────────────────────────────────────
    const [teams, settingsRow] = await Promise.all([
      this.db
        .selectFrom("team")
        .select(["id", "name"])
        .where("league_id", "=", leagueId)
        .execute(),
      this.db
        .selectFrom("league_daily_snapshot")
        .innerJoin(
          "league_settings_version",
          "league_settings_version.id",
          "league_daily_snapshot.settings_version_id",
        )
        .select(["league_settings_version.settings_json"])
        .where("league_daily_snapshot.league_id", "=", leagueId)
        .where("league_daily_snapshot.snapshot_date", "=", currDate)
        .executeTakeFirst(),
    ]);

    const numTeams = teams.length;
    const categories = (settingsRow?.settings_json?.categories as Array<{
      category_id: string;
      display_name: string;
      direction?: string;
    }>) ?? [];

    // ── Fetch all teams' projected category and actual totals for both dates ─
    const [
      prevCatRows,
      currCatRows,
      prevActualRows,
      currActualRows,
      prevOverallRow,
      currOverallRow,
    ] = await Promise.all([
      this.db
        .selectFrom("team_daily_projected_category")
        .select(["team_id", "category_id", "projected_value", "projected_roto_points"])
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", prevDate)
        .execute(),
      this.db
        .selectFrom("team_daily_projected_category")
        .select(["team_id", "category_id", "projected_value", "projected_roto_points"])
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", currDate)
        .execute(),
      this.db
        .selectFrom("team_daily_category_totals")
        .select(["team_id", "category_id", "value"])
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", prevDate)
        .execute(),
      this.db
        .selectFrom("team_daily_category_totals")
        .select(["team_id", "category_id", "value"])
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", currDate)
        .execute(),
      this.db
        .selectFrom("team_daily_projected_overall")
        .select(["projected_overall_points"])
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", prevDate)
        .where("team_id", "=", teamId)
        .executeTakeFirst(),
      this.db
        .selectFrom("team_daily_projected_overall")
        .select(["projected_overall_points"])
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", currDate)
        .where("team_id", "=", teamId)
        .executeTakeFirst(),
    ]);

    // Guard: no projected category data → degraded
    if (prevCatRows.length === 0 || currCatRows.length === 0) {
      return {
        snapshotDate: currDate,
        previousSnapshotDate: prevDate,
        attribution_available: false,
        teamId,
        teamName: teamRow?.name ?? `Team ${teamId}`,
        totalDelta: 0,
        buckets: null,
        categoryBreakdown: [],
      };
    }

    // ── Optional: player-level diff for projection_change bucket ───────────
    // Only diff when prevRunId !== currRunId (Pitfall 5 guard)
    let playerNameByProjectionDiff = new Map<string, string>(); // category_id → topDriverPlayer name
    if (!sameRunId && prevRunId !== null && currRunId !== null) {
      playerNameByProjectionDiff = await this.computeTopProjectionDrivers(
        leagueId,
        teamId,
        currDate,
        prevRunId,
        currRunId,
        prevCatRows,
      );
    }

    // ── Competitor movement: identify top mover per category ──────────────
    const competitorNameByCategory = await this.computeTopCompetitorMover(
      teams,
      prevCatRows,
      currCatRows,
      teamId,
    );

    // ── Per-category attribution ───────────────────────────────────────────
    const prevCatMap = this.buildCategoryMap(prevCatRows);
    const currCatMap = this.buildCategoryMap(currCatRows);
    const prevActualMap = this.buildActualMap(prevActualRows);
    const currActualMap = this.buildActualMap(currActualRows);

    const categoryBreakdown: CategoryAttribution[] = [];
    let totalActual = 0;
    let totalProjection = 0;
    let totalCompetitor = 0;

    const prevOverallPts = prevOverallRow?.projected_overall_points ?? 0;
    const currOverallPts = currOverallRow?.projected_overall_points ?? 0;
    const totalDelta = currOverallPts - prevOverallPts;

    for (const cat of categories) {
      const catId = cat.category_id;
      const direction: "HIGHER_BETTER" | "LOWER_BETTER" =
        cat.direction === "LOWER_BETTER" ? "LOWER_BETTER" : "HIGHER_BETTER";

      // Build per-team maps for this category
      const allPrevProjected = new Map<number, number>();
      const allCurrProjected = new Map<number, number>();
      const prevActuals = new Map<number, number>();
      const currActuals = new Map<number, number>();

      for (const t of teams) {
        allPrevProjected.set(t.id, prevCatMap.get(t.id)?.get(catId)?.projected_value ?? 0);
        allCurrProjected.set(t.id, currCatMap.get(t.id)?.get(catId)?.projected_value ?? 0);
        prevActuals.set(t.id, prevActualMap.get(t.id)?.get(catId) ?? 0);
        currActuals.set(t.id, currActualMap.get(t.id)?.get(catId) ?? 0);
      }

      const prevRotoPoints = prevCatMap.get(teamId)?.get(catId)?.projected_roto_points ?? 0;
      const currRotoPoints = currCatMap.get(teamId)?.get(catId)?.projected_roto_points ?? 0;
      const rotoDelta = currRotoPoints - prevRotoPoints;

      // Decompose into buckets
      const { actualDelta, hypotheticalProjected } = computeActualPerformanceDelta(
        prevActuals,
        currActuals,
        allPrevProjected,
        direction,
        numTeams,
        teamId,
      );

      const projDelta = computeProjectionChangeDelta(
        hypotheticalProjected,
        allCurrProjected,
        direction,
        numTeams,
        teamId,
        sameRunId,
      );

      const compDelta = attributeCompetitorMovement(rotoDelta, actualDelta, projDelta);

      totalActual += actualDelta;
      totalProjection += projDelta;
      totalCompetitor += compDelta;

      // Determine dominant bucket label
      const bucket = determineBucket(actualDelta, projDelta, compDelta);

      categoryBreakdown.push({
        category_id: catId,
        categoryName: cat.display_name,
        prevProjectedValue: allPrevProjected.get(teamId) ?? 0,
        currProjectedValue: allCurrProjected.get(teamId) ?? 0,
        prevRotoPoints,
        currRotoPoints,
        rotoDelta,
        bucket,
        topDriverPlayer: playerNameByProjectionDiff.get(catId),
        topCompetitorMoved: competitorNameByCategory.get(catId),
      });
    }

    return {
      snapshotDate: currDate,
      previousSnapshotDate: prevDate,
      attribution_available: true,
      teamId,
      teamName: teamRow?.name ?? `Team ${teamId}`,
      totalDelta,
      buckets: {
        actual_performance: totalActual,
        projection_change: totalProjection,
        competitor_movement: totalCompetitor,
      },
      categoryBreakdown,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildCategoryMap(
    rows: Array<{ team_id: number; category_id: string; projected_value: number; projected_roto_points: number }>,
  ): Map<number, Map<string, { projected_value: number; projected_roto_points: number }>> {
    const result = new Map<number, Map<string, { projected_value: number; projected_roto_points: number }>>();
    for (const row of rows) {
      if (!result.has(row.team_id)) result.set(row.team_id, new Map());
      result.get(row.team_id)!.set(row.category_id, {
        projected_value: row.projected_value,
        projected_roto_points: row.projected_roto_points,
      });
    }
    return result;
  }

  private buildActualMap(
    rows: Array<{ team_id: number; category_id: string; value: number }>,
  ): Map<number, Map<string, number>> {
    const result = new Map<number, Map<string, number>>();
    for (const row of rows) {
      if (!result.has(row.team_id)) result.set(row.team_id, new Map());
      result.get(row.team_id)!.set(row.category_id, row.value);
    }
    return result;
  }

  /**
   * For the projection_change bucket: diff player_projection between prevRunId
   * and currRunId for roster players. Surface top player per category whose
   * projected contribution changed most (>5% of team category total).
   * Pitfall 5 guard: caller must verify sameRunId=false before calling.
   */
  private async computeTopProjectionDrivers(
    leagueId: number,
    teamId: number,
    currDate: string,
    prevRunId: number,
    currRunId: number,
    prevCatRows: Array<{ team_id: number; category_id: string; projected_value: number; projected_roto_points: number }>,
  ): Promise<Map<string, string>> {
    // Get roster players at currDate
    const rosterRows = await this.db
      .selectFrom("team_roster_snapshot")
      .select(["player_id"])
      .where("team_id", "=", teamId)
      .where("snapshot_date", "=", currDate)
      .execute();

    const playerIds = rosterRows.map((r) => r.player_id);
    if (playerIds.length === 0) return new Map();

    // Fetch prev and curr projections for these players
    const [prevProj, currProj, playerNames] = await Promise.all([
      this.db
        .selectFrom("player_projection")
        .select(["player_id", "stat_components_json"])
        .where("projections_run_id", "=", prevRunId)
        .where("player_id", "in", playerIds)
        .execute(),
      this.db
        .selectFrom("player_projection")
        .select(["player_id", "stat_components_json"])
        .where("projections_run_id", "=", currRunId)
        .where("player_id", "in", playerIds)
        .execute(),
      this.db
        .selectFrom("player")
        .select(["espn_player_id", "name"])
        .where("espn_player_id", "in", playerIds)
        .execute(),
    ]);

    const prevProjMap = new Map(prevProj.map((p) => [p.player_id, p.stat_components_json]));
    const currProjMap = new Map(currProj.map((p) => [p.player_id, p.stat_components_json]));
    const nameMap = new Map(playerNames.map((p) => [p.espn_player_id, p.name]));

    // Find top driver per category: player whose stat changed most
    const result = new Map<string, string>();
    const teamCatTotals = new Map<string, number>();
    for (const row of prevCatRows) {
      if (row.team_id === teamId) {
        teamCatTotals.set(row.category_id, row.projected_value);
      }
    }

    const catDeltas = new Map<string, { playerId: number; delta: number }>();

    for (const playerId of playerIds) {
      const prevComponents = prevProjMap.has(playerId)
        ? (JSON.parse(prevProjMap.get(playerId) as unknown as string) as Record<string, number>)
        : {};
      const currComponents = currProjMap.has(playerId)
        ? (JSON.parse(currProjMap.get(playerId) as unknown as string) as Record<string, number>)
        : {};

      for (const [stat, currVal] of Object.entries(currComponents)) {
        const prevVal = prevComponents[stat] ?? 0;
        const delta = Math.abs(currVal - prevVal);
        const teamTotal = teamCatTotals.get(stat) ?? 0;
        // Only surface if change exceeds 5% of team total (reduces noise)
        if (teamTotal > 0 && delta / teamTotal >= 0.05) {
          const existing = catDeltas.get(stat);
          if (!existing || delta > existing.delta) {
            catDeltas.set(stat, { playerId, delta });
          }
        }
      }
    }

    for (const [catId, { playerId }] of catDeltas.entries()) {
      const name = nameMap.get(playerId);
      if (name) result.set(catId, name);
    }

    return result;
  }

  /**
   * For competitor_movement bucket: identify the top competitor (by name)
   * whose projected category value moved most between snapshots, for categories
   * where myTeam's absolute value was flat but rank changed.
   */
  private async computeTopCompetitorMover(
    teams: Array<{ id: number; name: string }>,
    prevCatRows: Array<{ team_id: number; category_id: string; projected_value: number; projected_roto_points: number }>,
    currCatRows: Array<{ team_id: number; category_id: string; projected_value: number; projected_roto_points: number }>,
    myTeamId: number,
  ): Promise<Map<string, string>> {
    const teamNameMap = new Map(teams.map((t) => [t.id, t.name]));
    const result = new Map<string, string>();

    // Build prev/curr maps for competitor analysis
    const prevMap = this.buildCategoryMap(prevCatRows);
    const currMap = this.buildCategoryMap(currCatRows);

    // Collect all category IDs
    const catIds = new Set<string>();
    for (const row of prevCatRows) catIds.add(row.category_id);

    for (const catId of catIds) {
      let topMover: { teamId: number; delta: number } | null = null;

      for (const team of teams) {
        if (team.id === myTeamId) continue; // skip focal team
        const prevVal = prevMap.get(team.id)?.get(catId)?.projected_value ?? 0;
        const currVal = currMap.get(team.id)?.get(catId)?.projected_value ?? 0;
        const delta = Math.abs(currVal - prevVal);
        if (!topMover || delta > topMover.delta) {
          topMover = { teamId: team.id, delta };
        }
      }

      if (topMover && topMover.delta > 0) {
        const name = teamNameMap.get(topMover.teamId);
        if (name) result.set(catId, name);
      }
    }

    return result;
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Determine the dominant bucket label for a category.
 * "mixed" when both actual and projection contributed non-trivially.
 */
function determineBucket(
  actualDelta: number,
  projDelta: number,
  compDelta: number,
): CategoryAttribution["bucket"] {
  const hasActual = Math.abs(actualDelta) > 0.01;
  const hasProj = Math.abs(projDelta) > 0.01;
  const hasComp = Math.abs(compDelta) > 0.01;

  if (hasActual && hasProj) return "mixed";
  if (hasActual) return "actual_performance";
  if (hasProj) return "projection_change";
  if (hasComp) return "competitor_movement";
  // Fallback: largest absolute value wins
  const absActual = Math.abs(actualDelta);
  const absProj = Math.abs(projDelta);
  const absComp = Math.abs(compDelta);
  if (absActual >= absProj && absActual >= absComp) return "actual_performance";
  if (absProj >= absActual && absProj >= absComp) return "projection_change";
  return "competitor_movement";
}
