import type { Kysely } from "kysely";
import type { Database } from "./schema.js";

/**
 * SnapshotRepository
 *
 * Centralizes repeated Kysely query patterns shared across agents and views.
 * Single place for the team_roster_snapshot → player join pattern.
 */
export class SnapshotRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Fetch all roster entries for a league+date, joined with player metadata.
   * Returns active, bench, and il rows.
   * Pass teamId to filter to a single team.
   */
  async getRosterForSnapshot(
    leagueId: number,
    snapshotDate: string,
    teamId?: number,
  ) {
    let query = this.db
      .selectFrom("team_roster_snapshot as roster")
      .innerJoin("player", "roster.player_id", "player.id")
      .select([
        "roster.team_id",
        "roster.player_id",
        "roster.roster_status",
        "roster.roster_slot",
        "player.name as player_name",
        "player.mlb_team",
        "player.positions",
        "player.espn_asv",
      ])
      .where("roster.league_id", "=", leagueId)
      .where("roster.snapshot_date", "=", snapshotDate)
      .where("roster.roster_status", "in", ["active", "bench", "il"]);

    if (teamId !== undefined) {
      query = query.where("roster.team_id", "=", teamId);
    }

    return query.execute();
  }

  /**
   * Fetch all category totals for a league+date.
   */
  async getLeagueCategoryTotals(leagueId: number, snapshotDate: string) {
    return this.db
      .selectFrom("team_daily_category_totals")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();
  }

  /**
   * Fetch player projections for a projections run.
   * When playerIds is provided and non-empty, filters to those players.
   * When playerIds is an empty array, returns [] immediately (avoids invalid IN () SQL).
   */
  async getPlayerProjections(projectionsRunId: number, playerIds?: number[]) {
    if (playerIds !== undefined && playerIds.length === 0) {
      return [];
    }

    let query = this.db
      .selectFrom("player_projection")
      .select(["player_id", "stat_components_json"])
      .where("projections_run_id", "=", projectionsRunId);

    if (playerIds !== undefined && playerIds.length > 0) {
      query = query.where("player_id", "in", playerIds);
    }

    return query.execute();
  }

  /**
   * Fetch league settings for a given snapshot date.
   * Joins league_daily_snapshot → league_settings_version.
   */
  async getLeagueSettings(leagueId: number, snapshotDate: string) {
    return this.db
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
  }

  /**
   * Fetch the most recent snapshot for a league.
   */
  async getLatestSnapshot(leagueId: number) {
    return this.db
      .selectFrom("league_daily_snapshot")
      .selectAll()
      .where("league_id", "=", leagueId)
      .orderBy("snapshot_date", "desc")
      .executeTakeFirst();
  }

  /**
   * Fetch free agent player IDs from league_free_agent_snapshot for a given date.
   * Returns an empty array when no snapshot exists for that date.
   */
  async getFreeAgentsForSnapshot(
    leagueId: number,
    snapshotDate: string,
  ): Promise<number[]> {
    const rows = await this.db
      .selectFrom("league_free_agent_snapshot")
      .select("player_id")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();
    return rows.map((r) => r.player_id);
  }

  /**
   * Fetch projected overall standings for a league+date.
   */
  async getProjectedOverall(leagueId: number, snapshotDate: string) {
    return this.db
      .selectFrom("team_daily_projected_overall")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();
  }

  /**
   * Fetch projected per-category standings for a league+date.
   */
  async getProjectedCategory(leagueId: number, snapshotDate: string) {
    return this.db
      .selectFrom("team_daily_projected_category")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();
  }

  /**
   * Fetch the most recent raw ESPN payload at or before snapshotDate.
   *
   * Snapshot-bound: prefers historical payloads captured on or before the
   * requested snapshot date so that simulation state is reproducible.
   * Falls back to null if no qualifying payload exists.
   */
  async getHistoricalRawPayload(
    leagueId: number,
    snapshotDate: string,
  ): Promise<{ response_json: unknown } | null> {
    // Use the day after snapshotDate as the exclusive upper bound so that
    // a payload fetched on snapshotDate itself (any time that day) is included.
    const dayAfter = new Date(snapshotDate);
    dayAfter.setDate(dayAfter.getDate() + 1);
    dayAfter.setHours(0, 0, 0, 0);

    return this.db
      .selectFrom("league_raw_payload")
      .select(["response_json"])
      .where("league_id", "=", leagueId)
      .where("fetched_at", "<", dayAfter)
      .orderBy("fetched_at", "desc")
      .executeTakeFirst() as Promise<{ response_json: unknown } | null>;
  }

  /**
   * Resolve the best projections run at or before `snapshotDate` and return
   * all player projections for that run.
   *
   * Returns `{ runId: null, projections: [] }` when no qualifying run exists.
   * Callers should check `runId` to determine if projections are available.
   */
  async getProjectionsByDate(snapshotDate: string): Promise<{
    runId: number | null;
    projections: Awaited<
      ReturnType<SnapshotRepository["getPlayerProjections"]>
    >;
  }> {
    const run = await this.db
      .selectFrom("projections_run")
      .select(["id"])
      .where("as_of_date", "<=", snapshotDate)
      .orderBy("as_of_date", "desc")
      .executeTakeFirst();

    if (!run) {
      return { runId: null, projections: [] };
    }

    const projections = await this.getPlayerProjections(run.id);
    return { runId: run.id, projections };
  }
}
