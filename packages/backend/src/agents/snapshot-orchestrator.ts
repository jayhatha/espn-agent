import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import type { LeagueSettings, StatComponents } from "../../../shared/dist/index.js";
import { ESPNAdapter, type ESPNAuthCookies, type ESPNTeamData, type ESPNScoringCategory } from "../adapters/espn.js";
import { StandingsProjectionAgent } from "./standings-projection.js";

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
        views: ["mSettings", "mTeam", "mRoster", "mStandings", "kona_player_info"],
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
          views: ["mSettings", "mTeam", "mRoster", "mStandings", "kona_player_info"],
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

      const isDegraded =
        !projectionsRun || projectionsRun.as_of_date !== snapshotDate;
      const degradedReasons: string[] = [];
      if (isDegraded && projectionsRun) {
        degradedReasons.push("projections_stale");
      } else if (!projectionsRun) {
        degradedReasons.push("projections_missing");
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

        // Write teams and collect DB team IDs
        const espnTeamIdToDbId = new Map<number, number>();
        for (const team of normalized.teams) {
          const result = await trx
            .insertInto("team")
            .values({
              league_id: leagueId,
              espn_team_id: team.id,
              name: team.name,
              created_at: new Date(),
            })
            .onConflict((oc) =>
              oc.columns(["league_id", "espn_team_id"]).doUpdateSet({
                name: team.name,
              }),
            )
            .returning("id")
            .executeTakeFirstOrThrow();
          espnTeamIdToDbId.set(team.id, result.id);
        }

        // Write players and roster snapshots
        await this.writePlayersAndRosters(
          trx, leagueId, snapshotDate, normalized.teams, espnTeamIdToDbId,
        );

        // Write free agent players
        await this.writeFreeAgentPlayers(trx, normalized.freeAgents || []);

        // Write current category totals, ranks, and overall
        const categories = normalized.settings.categories;
        if (categories.length > 0) {
          await this.writeCurrentStandings(
            trx, leagueId, snapshotDate, normalized.teams,
            espnTeamIdToDbId, categories,
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
            trx, leagueId, snapshotDate, rawTeams,
            espnTeamIdToDbId, snapshotScoringPeriodId,
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

    for (const team of teams) {
      const dbTeamId = espnTeamIdToDbId.get(team.id);
      if (!dbTeamId) continue;

      for (const entry of team.roster) {
        // Upsert player
        const playerResult = await trx
          .insertInto("player")
          .values({
            espn_player_id: entry.espnPlayerId,
            name: entry.name,
            mlb_team: entry.mlbTeam,
            positions: entry.positions,
            created_at: new Date(),
          } as any)
          .onConflict((oc) =>
            oc.column("espn_player_id").doUpdateSet({
              name: entry.name,
              mlb_team: entry.mlbTeam,
              positions: entry.positions,
            }),
          )
          .returning("id")
          .executeTakeFirstOrThrow();

        // Write roster snapshot
        await trx
          .insertInto("team_roster_snapshot")
          .values({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            team_id: dbTeamId,
            player_id: playerResult.id,
            roster_status: entry.rosterStatus,
            roster_slot: entry.rosterSlot,
            acquisition_type: entry.acquisitionType,
          })
          .execute();
      }
    }

    const totalPlayers = teams.reduce((sum, t) => sum + t.roster.length, 0);
    this.logger?.info({ leagueId, totalPlayers }, "Players and rosters written");
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

    // Write category totals for each team
    for (const team of teams) {
      const dbTeamId = espnTeamIdToDbId.get(team.id);
      if (!dbTeamId) continue;

      for (const cat of categories) {
        const value = team.statValues[cat.espnStatId] ?? 0;
        await trx
          .insertInto("team_daily_category_totals")
          .values({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            team_id: dbTeamId,
            category_id: cat.statKey,
            value,
            components_json: null,
          })
          .execute();
      }
    }

    // Rank teams per category and compute roto points
    const numTeams = teams.length;
    const teamOverallPoints = new Map<number, number>();

    for (const cat of categories) {
      const teamValues = teams
        .map((t) => ({
          dbTeamId: espnTeamIdToDbId.get(t.id)!,
          value: t.statValues[cat.espnStatId] ?? 0,
        }))
        .filter((tv) => tv.dbTeamId != null);

      // Sort by direction
      teamValues.sort((a, b) =>
        cat.direction === "LOWER_BETTER"
          ? a.value - b.value
          : b.value - a.value,
      );

      for (let i = 0; i < teamValues.length; i++) {
        const rank = i + 1;
        const rotoPoints = numTeams - rank + 1;
        const { dbTeamId } = teamValues[i];

        teamOverallPoints.set(
          dbTeamId,
          (teamOverallPoints.get(dbTeamId) || 0) + rotoPoints,
        );

        await trx
          .insertInto("team_daily_category_ranks")
          .values({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            team_id: dbTeamId,
            category_id: cat.statKey,
            rank,
            roto_points: rotoPoints,
          })
          .execute();
      }
    }

    // Write overall standings
    const overallRankings = Array.from(teamOverallPoints.entries())
      .map(([teamId, points]) => ({ teamId, points }))
      .sort((a, b) => b.points - a.points);

    for (let i = 0; i < overallRankings.length; i++) {
      await trx
        .insertInto("team_daily_overall")
        .values({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          team_id: overallRankings[i].teamId,
          overall_points: overallRankings[i].points,
          overall_rank: i + 1,
        })
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
    void await this.db
      .selectFrom("league_settings_version")
      .selectAll()
      .where("league_id", "=", leagueId)
      .orderBy("effective_date", "desc")
      .executeTakeFirst();

    // Convert ESPN categories to shared Category format
    const categories = (settings.categories || []).map((cat: ESPNScoringCategory) => ({
      category_id: cat.statKey,
      name: cat.name,
      stat_key: cat.statKey,
      type: cat.type,
      direction: cat.direction,
      formula_id: cat.formulaId,
      required_components: cat.requiredComponents,
    }));

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
      // Upsert free agent player
      await trx
        .insertInto("player")
        .values({
          espn_player_id: fa.playerId,
          name: fa.name,
          mlb_team: null,
          positions: fa.positions, // Use parsed positions instead of empty array
          created_at: new Date(),
        } as any)
        .onConflict((oc) =>
          oc.column("espn_player_id").doUpdateSet({
            name: fa.name,
            positions: fa.positions, // Update positions on conflict
          }),
        )
        .execute();
    }

    this.logger?.info({ freeAgentCount: freeAgents.length }, "Free agent players written");
  }

  /**
   * Write per-player period stats from raw ESPN team data.
   *
   * Queries the player table using espn_player_id (NOT player.id which is a
   * DB surrogate key), then upserts into player_period_stats for tenure tracking.
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
    // player.espn_player_id is the ESPN ID; player.id is the DB surrogate key
    const playerRows = await trx
      .selectFrom("player")
      .select(["id", "espn_player_id"])
      .where("espn_player_id", "in", espnPlayerIds)
      .execute();

    const espnPlayerIdToDbId = new Map<number, number>(
      playerRows.map((row) => [row.espn_player_id, row.id]),
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

        const espnPlayerId = entry.playerId ?? entry.playerPoolEntry?.player?.id;
        if (!espnPlayerId) continue;

        const dbPlayerId = espnPlayerIdToDbId.get(espnPlayerId);
        if (!dbPlayerId) continue;

        // Extract player stats for current scoring period (statSplitTypeId=5)
        const playerStats = entry.playerPoolEntry?.player?.stats || [];
        const periodStats = playerStats.find(
          (s: any) => s.statSplitTypeId === 5 && s.scoringPeriodId === scoringPeriodId,
        );

        if (!periodStats?.stats) continue;

        // Map ESPN stat IDs to component keys
        const components: Record<string, number> = {};
        for (const [statIdStr, value] of Object.entries(periodStats.stats as Record<string, number>)) {
          const statId = parseInt(statIdStr, 10);
          const componentKey = ESPN_PERIOD_STAT_MAP[statId];
          if (!componentKey || typeof value !== "number" || value === 0) continue;

          if (componentKey === "OUTS") {
            // Convert outs to innings pitched
            components["IP"] = (components["IP"] || 0) + value / 3;
          } else {
            components[componentKey] = (components[componentKey] || 0) + value;
          }
        }

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
            oc.columns(["league_id", "scoring_period", "player_id"]).doUpdateSet({
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
