import type { Kysely } from "kysely";
import type { BaseLogger } from "pino";
import pino from "pino";
import type { Database } from "../db/schema.js";
import { ESPNAdapter } from "../adapters/espn.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { StandingsChangeLogAgent } from "./standings-change-log.js";
import { createNotificationBus } from "../utils/notification-bus.js";
import {
  changeLogEmitter,
  CHANGE_LOG_EVENT,
  LIVE_POLL_EVENT,
} from "../utils/change-log-emitter.js";
import { assignRanksWithTies } from "../utils/roto-ranking.js";
import {
  getEspnAuthFromEnv,
  getEspnAuthFromLeague,
} from "../utils/espn-env.js";

/**
 * LivePollAgent
 * Per Phase 82: polls ESPN every 15 minutes during game hours, updates
 * today's category/rank/overall tables, recomputes projections, and emits
 * change events through the existing SSE infrastructure.
 */
export class LivePollAgent {
  private espnAdapter: ESPNAdapter;
  private standingsAgent: StandingsProjectionAgent;

  constructor(
    private db: Kysely<Database>,
    private logger?: BaseLogger,
  ) {
    this.espnAdapter = new ESPNAdapter(logger);
    this.standingsAgent = new StandingsProjectionAgent(db, logger);
  }

  /**
   * Returns true if current UTC time is within the MLB game window.
   * Games roughly 1pm–midnight ET (EDT = UTC−4).
   * In UTC: 17:00–04:00.
   */
  static isGameWindow(): boolean {
    const h = new Date().getUTCHours();
    return h >= 17 || h < 4;
  }

  /**
   * Refresh standings for one league from live ESPN data.
   * Returns the number of change events generated.
   */
  async refresh(leagueId: number, today: string): Promise<number> {
    const log = this.logger ?? pino();

    // 1. Load league
    const league = await this.db
      .selectFrom("league")
      .selectAll()
      .where("id", "=", leagueId)
      .executeTakeFirstOrThrow();

    // 2. Fetch ESPN — lightweight views only (no rosters, no free agents)
    // Auth: env vars take priority; fall back to DB-stored encrypted credentials
    const auth = getEspnAuthFromEnv() ?? getEspnAuthFromLeague(league);
    if (!auth) {
      log.warn(
        { leagueId },
        "LivePollAgent: no ESPN credentials available — skipping refresh. " +
          "Set ESPN_SWID + ESPN_S2 env vars or store credentials via /auth endpoint.",
      );
      return 0;
    }
    const espnData = await this.espnAdapter.fetchLeague({
      leagueId: league.espn_league_id,
      season: league.season,
      auth,
      views: ["mSettings", "mTeam", "mStandings"],
    });
    const normalized = this.espnAdapter.normalizeLeagueData(espnData.data);
    const { teams, settings } = normalized;
    const categories = settings.categories;

    if (categories.length === 0) {
      log.warn({ leagueId }, "LivePollAgent: no categories found, skipping");
      return 0;
    }

    // 3. Build ESPN team id → DB team id map
    const dbTeams = await this.db
      .selectFrom("team")
      .select(["id", "espn_team_id"])
      .where("league_id", "=", leagueId)
      .execute();

    if (dbTeams.length === 0) {
      log.warn({ leagueId }, "LivePollAgent: no DB teams, skipping");
      return 0;
    }

    const espnTeamIdToDbId = new Map(
      dbTeams.map((t) => [t.espn_team_id, t.id]),
    );

    // 4. Resolve most recent settings version + projections run
    const settingsVersion = await this.db
      .selectFrom("league_settings_version")
      .select("id")
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    const projectionsRun = await this.db
      .selectFrom("projections_run")
      .select("id")
      .where("as_of_date", "<=", today)
      .orderBy("as_of_date", "desc")
      .executeTakeFirst();

    // 5. Ensure today's snapshot row exists so StandingsChangeLogAgent can find it.
    //    ON CONFLICT DO NOTHING — if a real snapshot already ran, leave it alone.
    if (settingsVersion) {
      await this.db
        .insertInto("league_daily_snapshot")
        .values({
          league_id: leagueId,
          snapshot_date: today,
          created_at: new Date(),
          settings_version_id: settingsVersion.id,
          projections_run_id: projectionsRun?.id ?? null,
          is_degraded: true,
          degraded_reasons: ["live_poll_intraday"],
        })
        .onConflict((oc) =>
          oc.columns(["league_id", "snapshot_date"]).doNothing(),
        )
        .execute();
    }

    // 6. Replace today's standings data inside a transaction
    await this.db.transaction().execute(async (trx) => {
      // Delete current day's data
      await trx
        .deleteFrom("team_daily_category_totals")
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", today)
        .execute();
      await trx
        .deleteFrom("team_daily_category_ranks")
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", today)
        .execute();
      await trx
        .deleteFrom("team_daily_overall")
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", today)
        .execute();

      // Build totals rows
      const totalsRows: Array<{
        league_id: number;
        snapshot_date: string;
        team_id: number;
        category_id: string;
        value: number;
        components_json: null;
      }> = [];

      for (const team of teams) {
        const dbTeamId = espnTeamIdToDbId.get(team.id);
        if (!dbTeamId) continue;
        for (const cat of categories) {
          totalsRows.push({
            league_id: leagueId,
            snapshot_date: today,
            team_id: dbTeamId,
            category_id: cat.statKey,
            value: team.statValues[cat.espnStatId] ?? 0,
            components_json: null,
          });
        }
      }

      if (totalsRows.length > 0) {
        await trx
          .insertInto("team_daily_category_totals")
          .values(totalsRows)
          .execute();
      }

      // Rank per category, accumulate overall roto points
      const numTeams = teams.length;
      const teamOverallPoints = new Map<number, number>();
      const rankRows: Array<{
        league_id: number;
        snapshot_date: string;
        team_id: number;
        category_id: string;
        rank: number;
        roto_points: number;
      }> = [];

      for (const cat of categories) {
        const teamValues = teams
          .map((t) => ({
            dbTeamId: espnTeamIdToDbId.get(t.id)!,
            value: t.statValues[cat.espnStatId] ?? 0,
          }))
          .filter((tv) => tv.dbTeamId != null);

        teamValues.sort((a, b) =>
          cat.direction === "LOWER_BETTER"
            ? a.value - b.value
            : b.value - a.value,
        );

        const ranked = assignRanksWithTies(
          teamValues.map((tv) => ({ teamId: tv.dbTeamId, value: tv.value })),
          numTeams,
        );

        for (const { teamId, rank, rotoPoints } of ranked) {
          teamOverallPoints.set(
            teamId,
            (teamOverallPoints.get(teamId) ?? 0) + rotoPoints,
          );
          rankRows.push({
            league_id: leagueId,
            snapshot_date: today,
            team_id: teamId,
            category_id: cat.statKey,
            rank,
            roto_points: rotoPoints,
          });
        }
      }

      if (rankRows.length > 0) {
        await trx
          .insertInto("team_daily_category_ranks")
          .values(rankRows)
          .execute();
      }

      // Insert overall standings
      const overallSorted = Array.from(teamOverallPoints.entries())
        .map(([teamId, value]) => ({ teamId, value }))
        .sort((a, b) => b.value - a.value);

      const overallRanked = assignRanksWithTies(overallSorted, numTeams);

      if (overallRanked.length > 0) {
        await trx
          .insertInto("team_daily_overall")
          .values(
            overallRanked.map(({ teamId, rank }) => ({
              league_id: leagueId,
              snapshot_date: today,
              team_id: teamId,
              overall_points: teamOverallPoints.get(teamId) ?? 0,
              overall_rank: rank,
            })),
          )
          .execute();
      }
    });

    // 7. Recompute projected standings (non-fatal if no projections)
    if (projectionsRun) {
      try {
        await this.standingsAgent.computeProjectedStandings(
          leagueId,
          today,
          projectionsRun.id,
        );
      } catch (err) {
        log.warn(
          { err, leagueId },
          "LivePollAgent: projection recompute failed — non-fatal",
        );
      }
    }

    // 8. Generate and persist change events (non-fatal)
    let eventCount = 0;
    try {
      const bus = createNotificationBus(log);
      const changeLogAgent = new StandingsChangeLogAgent(this.db, log, bus);
      eventCount = await changeLogAgent.generateEvents(leagueId, today);
    } catch (err) {
      log.warn(
        { err, leagueId },
        "LivePollAgent: change log generation failed — non-fatal",
      );
    }

    // 9. Emit to SSE clients
    const polledAt = new Date().toISOString();
    if (eventCount > 0) {
      changeLogEmitter.emit(CHANGE_LOG_EVENT, {
        leagueId,
        snapshotDate: today,
        eventCount,
      });
    }
    // Always emit LIVE_POLL_EVENT so frontend can update "last refreshed" indicator
    changeLogEmitter.emit(LIVE_POLL_EVENT, { leagueId, polledAt, eventCount });

    log.info(
      { leagueId, today, eventCount },
      "LivePollAgent: refresh complete",
    );
    return eventCount;
  }
}
