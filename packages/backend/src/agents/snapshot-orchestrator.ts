import type { BaseLogger } from "pino";
import pino from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type {
  LeagueSettings,
  StatComponents,
} from "../../../shared/dist/index.js";
import {
  ESPNAdapter,
  type ESPNAuthCookies,
  type ESPNTeamData,
  type ESPNScoringCategory,
} from "../adapters/espn.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { StandingsChangeLogAgent } from "./standings-change-log.js";
import { createNotificationBus } from "../utils/notification-bus.js";
import {
  changeLogEmitter,
  CHANGE_LOG_EVENT,
} from "../utils/change-log-emitter.js";
import { assignRanksWithTies } from "../utils/roto-ranking.js";

/**
 * ESPN stat ID → component key mapping for player period stats extraction.
 * Only COUNTING stats are stored in components_json — RATE stats are computed
 * from components at read time.
 */
const ESPN_PERIOD_STAT_MAP: Record<number, string> = {
  // Batting counting stats
  0: "AB",
  1: "H",
  3: "2B",
  4: "3B",
  5: "HR",
  8: "TB",
  10: "BB",
  12: "HBP",
  13: "SF",
  20: "R",
  21: "RBI",
  23: "SB",
  24: "CS",
  27: "SO",
  // Pitching counting stats (OUTS converted to IP on ingestion)
  34: "OUTS", // will be converted to IP via / 3
  37: "HA",
  39: "BBA",
  45: "ER",
  46: "HRA",
  48: "K",
  53: "W",
  54: "L",
  57: "SV",
  58: "BLSV",
  60: "HLD",
  63: "QS",
};

/**
 * Snapshot Orchestrator Agent
 * Per AGENTS.md §8
 *
 * Produces canonical daily snapshot for a league at 03:00 timezone
 * Includes transactions and projected standings
 */

export interface SnapshotJobOptions {
  leagueId: number;
  snapshotDate: string; // DATE in ISO format
  espnAuth?: ESPNAuthCookies;
  forceFresh?: boolean;
}

export class SnapshotOrchestratorAgent {
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
   * Execute daily snapshot job
   */
  async executeSnapshot(options: SnapshotJobOptions): Promise<void> {
    const { leagueId, snapshotDate, espnAuth, forceFresh } = options;

    this.logger?.info({ leagueId, snapshotDate }, "Starting snapshot job");

    // Check if snapshot already exists
    if (!forceFresh) {
      const existing = await this.db
        .selectFrom("league_daily_snapshot")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", snapshotDate)
        .executeTakeFirst();

      if (existing) {
        this.logger?.info(
          { leagueId, snapshotDate },
          "Snapshot already exists, skipping",
        );
        return;
      }
    }

    try {
      // 1. Fetch league info
      const league = await this.db
        .selectFrom("league")
        .selectAll()
        .where("id", "=", leagueId)
        .executeTakeFirstOrThrow();

      // 2. Fetch ESPN data (including kona_player_info for free agents)
      const espnData = await this.espnAdapter.fetchLeague({
        leagueId: league.espn_league_id,
        season: league.season,
        auth: espnAuth,
        views: [
          "mSettings",
          "mTeam",
          "mRoster",
          "mStandings",
          "kona_player_info",
        ],
        xFantasyFilter: {
          players: {
            limit: 1500,
            sortDraftRanks: {
              sortPriority: 100,
              sortAsc: true,
              value: "STANDARD",
            },
          },
        },
      });

      // Archive raw payload
      await this.db
        .insertInto("league_raw_payload")
        .values({
          league_id: leagueId,
          fetched_at: espnData.fetchedAt,
          endpoint: `/seasons/${league.season}/segments/0/leagues/${league.espn_league_id}`,
          views: [
            "mSettings",
            "mTeam",
            "mRoster",
            "mStandings",
            "kona_player_info",
          ],
          scoring_period_id: null,
          x_fantasy_filter: {
            players: {
              limit: 1500,
              sortDraftRanks: {
                sortPriority: 100,
                sortAsc: true,
                value: "STANDARD",
              },
            },
          },
          response_json: espnData.data,
          schema_fingerprint: espnData.schemaFingerprint,
        })
        .execute();

      // 3. Normalize data
      const normalized = this.espnAdapter.normalizeLeagueData(espnData.data);

      // 4. Determine settings version
      const settingsVersionId = await this.getOrCreateSettingsVersion(
        leagueId,
        snapshotDate,
        normalized.settings,
      );

      // 5. Select projections run
      const projectionsRun = await this.db
        .selectFrom("projections_run")
        .selectAll()
        .where("as_of_date", "<=", snapshotDate)
        .orderBy("as_of_date", "desc")
        .executeTakeFirst();

      // Normalize dates for comparison (DB may return Date object or ISO string)
      const normDate = (d: unknown): string => {
        if (d instanceof Date) return d.toISOString().split("T")[0];
        return String(d).split("T")[0];
      };
      const projDate = projectionsRun
        ? normDate(projectionsRun.as_of_date)
        : "";
      const snapDate = normDate(snapshotDate);

      const isDegraded =
        !projectionsRun ||
        projDate !== snapDate ||
        projectionsRun.staleness !== "fresh";
      const degradedReasons: string[] = [];
      if (!projectionsRun) {
        degradedReasons.push("projections_missing");
      } else if (projDate !== snapDate) {
        degradedReasons.push("projections_stale");
      } else if (projectionsRun.staleness !== "fresh") {
        degradedReasons.push("projections_stale");
      }

      // 6. Begin transaction and write snapshot
      await this.db.transaction().execute(async (trx) => {
        // Write snapshot
        await trx
          .insertInto("league_daily_snapshot")
          .values({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            created_at: new Date(),
            settings_version_id: settingsVersionId,
            projections_run_id: projectionsRun?.id || null,
            is_degraded: isDegraded,
            degraded_reasons: degradedReasons,
          })
          .onConflict((oc) =>
            oc.columns(["league_id", "snapshot_date"]).doUpdateSet({
              created_at: new Date(),
              settings_version_id: settingsVersionId,
              projections_run_id: projectionsRun?.id || null,
              is_degraded: isDegraded,
              degraded_reasons: degradedReasons,
            }),
          )
          .execute();

        // Write teams in a single batch upsert and collect DB team IDs
        const espnTeamIdToDbId = new Map<number, number>();
        if (normalized.teams.length > 0) {
          const teamRows = normalized.teams.map((team) => ({
            league_id: leagueId,
            espn_team_id: team.id,
            name: team.name,
            created_at: new Date(),
          }));
          const upsertedTeams = await trx
            .insertInto("team")
            .values(teamRows)
            .onConflict((oc) =>
              oc.columns(["league_id", "espn_team_id"]).doUpdateSet((eb) => ({
                name: eb.ref("excluded.name"),
              })),
            )
            .returning(["id", "espn_team_id"])
            .execute();
          for (const row of upsertedTeams) {
            espnTeamIdToDbId.set(row.espn_team_id, row.id);
          }
        }

        // Write players and roster snapshots
        await this.writePlayersAndRosters(
          trx,
          leagueId,
          snapshotDate,
          normalized.teams,
          espnTeamIdToDbId,
        );

        // Write free agent players
        await this.writeFreeAgentPlayers(trx, normalized.freeAgents || []);

        // Write current category totals, ranks, and overall
        const categories = normalized.settings.categories;
        if (categories.length > 0) {
          await this.writeCurrentStandings(
            trx,
            leagueId,
            snapshotDate,
            normalized.teams,
            espnTeamIdToDbId,
            categories,
          );
        }

        // Store per-player period stats for tenure tracking
        // Extract scoringPeriodId from raw ESPN data
        const rawData = espnData.data as Record<string, any>;
        const rawTeams = rawData?.teams;
        const snapshotScoringPeriodId =
          rawData?.scoringPeriodId ??
          rawData?.status?.currentScoringPeriod?.id ??
          1;
        if (rawTeams && Array.isArray(rawTeams)) {
          await this.writePlayerPeriodStats(
            trx,
            leagueId,
            snapshotDate,
            rawTeams,
            espnTeamIdToDbId,
            snapshotScoringPeriodId,
          );
        }

        this.logger?.info({ leagueId, snapshotDate }, "Snapshot data written");
      });

      // 7. Compute projected standings
      if (projectionsRun) {
        await this.standingsAgent.computeProjectedStandings(
          leagueId,
          snapshotDate,
          projectionsRun.id,
        );
      }

      // 8. Generate standings change log events (Phase 81)
      // Non-blocking: errors here do not fail the snapshot
      try {
        const logger = this.logger ?? pino();
        const bus = createNotificationBus(logger);
        const changeLogAgent = new StandingsChangeLogAgent(
          this.db,
          logger,
          bus,
        );
        const eventCount = await changeLogAgent.generateEvents(
          leagueId,
          snapshotDate,
          "snapshot",
        );
        if (eventCount > 0) {
          changeLogEmitter.emit(CHANGE_LOG_EVENT, {
            leagueId,
            snapshotDate,
            eventCount,
          });
        }
        this.logger?.info(
          { leagueId, snapshotDate, eventCount },
          "Change log events generated",
        );
      } catch (err) {
        this.logger?.warn(
          { err, leagueId, snapshotDate },
          "Change log generation failed — non-fatal",
        );
      }

      this.logger?.info(
        { leagueId, snapshotDate },
        "Snapshot job completed successfully",
      );
    } catch (error) {
      this.logger?.error(
        { error, leagueId, snapshotDate },
        "Snapshot job failed",
      );
      throw error;
    }
  }

  private async writePlayersAndRosters(
    trx: Kysely<Database>,
    leagueId: number,
    snapshotDate: string,
    teams: ESPNTeamData[],
    espnTeamIdToDbId: Map<number, number>,
  ): Promise<void> {
    // Delete existing roster snapshot for this date (in case of forceFresh)
    await trx
      .deleteFrom("team_roster_snapshot")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    // Batch upsert all unique players (1 query instead of N per player)
    const uniquePlayers = new Map<number, (typeof teams)[0]["roster"][0]>();
    for (const team of teams) {
      for (const entry of team.roster) {
        uniquePlayers.set(entry.espnPlayerId, entry);
      }
    }

    const playerValues = Array.from(uniquePlayers.values()).map((entry) => ({
      id: entry.espnPlayerId,
      name: entry.name,
      mlb_team: entry.mlbTeam,
      positions: entry.positions,
      created_at: new Date(),
    }));

    if (playerValues.length > 0) {
      // Batch in chunks of 500 to avoid parameter limits
      for (let i = 0; i < playerValues.length; i += 500) {
        const chunk = playerValues.slice(i, i + 500);
        await trx
          .insertInto("player")
          .values(chunk as any)
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({
              name: (eb: any) => eb.ref("excluded.name"),
              mlb_team: (eb: any) => eb.ref("excluded.mlb_team"),
              positions: (eb: any) => eb.ref("excluded.positions"),
            }),
          )
          .execute();
      }
    }

    // Batch insert all roster snapshots (1 query instead of N per player)
    const rosterRows: Array<{
      league_id: number;
      snapshot_date: string;
      team_id: number;
      player_id: number;
      roster_status: "active" | "bench" | "il" | "na" | "unknown";
      roster_slot: string | null;
      acquisition_type: string | null;
    }> = [];

    for (const team of teams) {
      const dbTeamId = espnTeamIdToDbId.get(team.id);
      if (!dbTeamId) continue;

      for (const entry of team.roster) {
        rosterRows.push({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          team_id: dbTeamId,
          player_id: entry.espnPlayerId,
          roster_status: entry.rosterStatus,
          roster_slot: entry.rosterSlot,
          acquisition_type: entry.acquisitionType,
        });
      }
    }

    if (rosterRows.length > 0) {
      for (let i = 0; i < rosterRows.length; i += 500) {
        const chunk = rosterRows.slice(i, i + 500);
        await trx.insertInto("team_roster_snapshot").values(chunk).execute();
      }
    }

    const totalPlayers = teams.reduce((sum, t) => sum + t.roster.length, 0);
    this.logger?.info(
      { leagueId, totalPlayers },
      "Players and rosters written",
    );
  }

  private async writeCurrentStandings(
    trx: Kysely<Database>,
    leagueId: number,
    snapshotDate: string,
    teams: ESPNTeamData[],
    espnTeamIdToDbId: Map<number, number>,
    categories: ESPNScoringCategory[],
  ): Promise<void> {
    // Delete existing standings for this snapshot (in case of forceFresh)
    await trx
      .deleteFrom("team_daily_category_totals")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();
    await trx
      .deleteFrom("team_daily_category_ranks")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();
    await trx
      .deleteFrom("team_daily_overall")
      .where("league_id", "=", leagueId)
      .where("snapshot_date", "=", snapshotDate)
      .execute();

    // Batch insert all category totals (1 query instead of teams × categories)
    const categoryTotalsRows: Array<{
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
        categoryTotalsRows.push({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          team_id: dbTeamId,
          category_id: cat.statKey,
          value: team.statValues[cat.espnStatId] ?? 0,
          components_json: null,
        });
      }
    }

    if (categoryTotalsRows.length > 0) {
      await trx
        .insertInto("team_daily_category_totals")
        .values(categoryTotalsRows)
        .execute();
    }

    // Rank teams per category and batch insert ranks
    const numTeams = teams.length;
    const teamOverallPoints = new Map<number, number>();
    const categoryRankRows: Array<{
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

      const sorted = teamValues.map((tv) => ({
        teamId: tv.dbTeamId,
        value: tv.value,
      }));
      const ranked = assignRanksWithTies(sorted, numTeams);

      for (const { teamId: dbTeamId, rank, rotoPoints } of ranked) {
        teamOverallPoints.set(
          dbTeamId,
          (teamOverallPoints.get(dbTeamId) || 0) + rotoPoints,
        );

        categoryRankRows.push({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          team_id: dbTeamId,
          category_id: cat.statKey,
          rank,
          roto_points: rotoPoints,
        });
      }
    }

    if (categoryRankRows.length > 0) {
      await trx
        .insertInto("team_daily_category_ranks")
        .values(categoryRankRows)
        .execute();
    }

    // Batch insert overall standings
    const overallSorted = Array.from(teamOverallPoints.entries())
      .map(([teamId, points]) => ({ teamId, value: points }))
      .sort((a, b) => b.value - a.value);

    const overallRanked = assignRanksWithTies(overallSorted, numTeams);

    if (overallRanked.length > 0) {
      await trx
        .insertInto("team_daily_overall")
        .values(
          overallRanked.map(({ teamId, rank }) => ({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            team_id: teamId,
            overall_points: teamOverallPoints.get(teamId) || 0,
            overall_rank: rank,
          })),
        )
        .execute();
    }

    this.logger?.info(
      { leagueId, numCategories: categories.length, numTeams },
      "Current standings written",
    );
  }

  private async getOrCreateSettingsVersion(
    leagueId: number,
    effectiveDate: string,
    settings: any,
  ): Promise<number> {
    // Check if settings changed
    void (await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst());

    // Convert ESPN categories to shared Category format
    const categories = (settings.categories || []).map(
      (cat: ESPNScoringCategory) => ({
        category_id: cat.statKey,
        name: cat.name,
        stat_key: cat.statKey,
        type: cat.type,
        direction: cat.direction,
        formula_id: cat.formulaId,
        required_components: cat.requiredComponents,
      }),
    );

    const settingsJson: LeagueSettings = {
      scoring_format: settings.scoringFormat || "unknown",
      categories,
      roster_slots: settings.rosterSlots || {},
      acquisition_rules: settings.acquisitionRules || {},
    };

    // Check if settings for this exact date already exist
    const existingForDate = await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("league_id", "=", leagueId)
      .where("effective_date", "=", effectiveDate)
      .executeTakeFirst();

    if (existingForDate) {
      // Update existing settings for this date if different
      if (
        JSON.stringify(existingForDate.settings_json) !==
        JSON.stringify(settingsJson)
      ) {
        await this.db
          .updateTable("league_settings_version")
          .set({
            settings_json: settingsJson,
          })
          .where("id", "=", existingForDate.id)
          .execute();
      }
      return existingForDate.id;
    }

    // Create new settings version
    const result = await this.db
      .insertInto("league_settings_version")
      .values({
        league_id: leagueId,
        effective_date: effectiveDate,
        settings_json: settingsJson,
        created_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    return result.id;
  }

  private async writeFreeAgentPlayers(
    trx: Kysely<Database>,
    freeAgents: Array<{ playerId: number; name: string; positions: string[] }>,
  ): Promise<void> {
    if (!freeAgents || freeAgents.length === 0) {
      this.logger?.info("No free agents to write");
      return;
    }

    for (const fa of freeAgents) {
      // Upsert free agent player (player.id IS the ESPN player ID after migration 016)
      await trx
        .insertInto("player")
        .values({
          id: fa.playerId,
          name: fa.name,
          mlb_team: null,
          positions: fa.positions,
          created_at: new Date(),
        } as any)
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            name: fa.name,
            positions: fa.positions,
          }),
        )
        .execute();
    }

    this.logger?.info(
      { freeAgentCount: freeAgents.length },
      "Free agent players written",
    );
  }

  /**
   * Write per-player period stats from raw ESPN team data.
   *
   * Queries the player table by id (which IS the ESPN player ID after migration 016),
   * then upserts into player_period_stats for tenure tracking.
   *
   * Only COUNTING stats are stored; rate stats (AVG, ERA, WHIP) are computed
   * from components at read time.
   *
   * Skips IL (lineupSlotId=17) and NA (lineupSlotId=19) players.
   * Uses statSplitTypeId=5 for current scoring period stats.
   */
  private async writePlayerPeriodStats(
    trx: Kysely<Database>,
    leagueId: number,
    snapshotDate: string,
    rawTeams: any[],
    espnTeamIdToDbId: Map<number, number>,
    scoringPeriodId: number,
  ): Promise<void> {
    // Collect all ESPN player IDs from all teams' rosters (excluding IL/NA)
    const espnPlayerIds: number[] = [];
    for (const rawTeam of rawTeams) {
      const entries = rawTeam.roster?.entries || [];
      for (const entry of entries) {
        const lineupSlotId = entry.lineupSlotId ?? -1;
        // Skip IL (17) and NA (19)
        if (lineupSlotId === 17 || lineupSlotId === 19) continue;
        const playerId = entry.playerId ?? entry.playerPoolEntry?.player?.id;
        if (playerId) espnPlayerIds.push(playerId);
      }
    }

    if (espnPlayerIds.length === 0) return;

    // Build ESPN player ID -> DB player ID lookup
    // After migration 016, player.id IS the ESPN player ID (no separate column)
    const playerRows = await trx
      .selectFrom("player")
      .select(["id"])
      .where("id", "in", espnPlayerIds)
      .execute();

    const espnPlayerIdToDbId = new Map<number, number>(
      playerRows.map((row) => [row.id, row.id]),
    );

    let storedCount = 0;

    for (const rawTeam of rawTeams) {
      const espnTeamId = rawTeam.id as number;
      const dbTeamId = espnTeamIdToDbId.get(espnTeamId);
      if (!dbTeamId) continue;

      const entries = rawTeam.roster?.entries || [];
      for (const entry of entries) {
        const lineupSlotId = entry.lineupSlotId ?? -1;
        // Skip IL (17) and NA (19)
        if (lineupSlotId === 17 || lineupSlotId === 19) continue;

        const espnPlayerId =
          entry.playerId ?? entry.playerPoolEntry?.player?.id;
        if (!espnPlayerId) continue;

        const dbPlayerId = espnPlayerIdToDbId.get(espnPlayerId);
        if (!dbPlayerId) continue;

        // Extract player stats for current scoring period (statSplitTypeId=5)
        const playerStats = entry.playerPoolEntry?.player?.stats || [];
        const periodStats = playerStats.find(
          (s: any) =>
            s.statSplitTypeId === 5 && s.scoringPeriodId === scoringPeriodId,
        );

        if (!periodStats?.stats) continue;

        // Map ESPN stat IDs to component keys
        const components: Record<string, number> = {};
        for (const [statIdStr, value] of Object.entries(
          periodStats.stats as Record<string, number>,
        )) {
          const statId = parseInt(statIdStr, 10);
          const componentKey = ESPN_PERIOD_STAT_MAP[statId];
          if (!componentKey || typeof value !== "number" || value === 0)
            continue;

          if (componentKey === "OUTS") {
            // Convert outs to innings pitched
            components["IP"] = (components["IP"] || 0) + value / 3;
          } else {
            components[componentKey] = (components[componentKey] || 0) + value;
          }
        }

        // Skip if no stats were mapped (avoids storing empty {} rows that pollute tenure aggregation)
        if (Object.keys(components).length === 0) continue;

        // Upsert into player_period_stats
        await trx
          .insertInto("player_period_stats")
          .values({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            scoring_period: scoringPeriodId,
            player_id: dbPlayerId,
            team_id: dbTeamId,
            lineup_slot_id: lineupSlotId >= 0 ? lineupSlotId : null,
            components_json: components as StatComponents,
          })
          .onConflict((oc) =>
            oc
              .columns(["league_id", "scoring_period", "player_id"])
              .doUpdateSet({
                snapshot_date: snapshotDate,
                team_id: dbTeamId,
                lineup_slot_id: lineupSlotId >= 0 ? lineupSlotId : null,
                components_json: components as StatComponents,
              }),
          )
          .execute();

        storedCount++;
      }
    }

    this.logger?.info(
      { leagueId, scoringPeriodId, storedCount },
      "Player period stats written",
    );
  }
}
