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
}
