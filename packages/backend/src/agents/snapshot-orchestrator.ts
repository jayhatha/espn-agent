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
import {
  changeLogEmitter,
  CHANGE_LOG_EVENT,
} from "../utils/change-log-emitter.js";
import { assignRanksWithTies } from "../utils/roto-ranking.js";

/**
 * Compute degraded status and reasons for a snapshot.
 * Pure function — no DB access, fully testable in isolation.
 */
export function computeDegradedStatus(
  projectionsRun: { as_of_date: unknown; staleness: string } | undefined,
  snapshotDate: string,
): { isDegraded: boolean; degradedReasons: string[] } {
  const normDate = (d: unknown): string => {
    if (d instanceof Date) return d.toISOString().split("T")[0];
    return String(d).split("T")[0];
  };

  if (!projectionsRun) {
    return { isDegraded: true, degradedReasons: ["projections_missing"] };
  }

  const projDate = normDate(projectionsRun.as_of_date);
  const snapDate = normDate(snapshotDate);

  if (projDate !== snapDate || projectionsRun.staleness !== "fresh") {
    return { isDegraded: true, degradedReasons: ["projections_stale"] };
  }

  return { isDegraded: false, degradedReasons: [] };
}

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

/**
 * Build stat components from raw ESPN `valuesByStat` for a RATE category.
 * Returns null for unknown formulaIds (component math not applicable).
 * IP is derived from OUTS (ESPN stat 34) divided by 3.
 */
function buildCurrentComponents(
  formulaId: string,
  statValues: Record<number, number>,
): StatComponents | null {
  const ip = (statValues[34] ?? 0) / 3;
  switch (formulaId) {
    case "avg":
      return { H: statValues[1] ?? 0, AB: statValues[0] ?? 0 };
    case "obp":
      return {
        H: statValues[1] ?? 0,
        BB: statValues[10] ?? 0,
        HBP: statValues[12] ?? 0,
        AB: statValues[0] ?? 0,
        SF: statValues[13] ?? 0,
      };
    case "slg":
      return { TB: statValues[8] ?? 0, AB: statValues[0] ?? 0 };
    case "ops":
      return {
        H: statValues[1] ?? 0,
        BB: statValues[10] ?? 0,
        HBP: statValues[12] ?? 0,
        AB: statValues[0] ?? 0,
        SF: statValues[13] ?? 0,
        TB: statValues[8] ?? 0,
      };
    case "era":
      return { ER: statValues[45] ?? 0, IP: ip };
    case "whip":
      return { HA: statValues[37] ?? 0, BBA: statValues[39] ?? 0, IP: ip };
    case "k9":
      return { K: statValues[48] ?? 0, IP: ip };
    default:
      return null;
  }
}

export class SnapshotOrchestratorAgent {
  private readonly espnAdapter: ESPNAdapter;
  private readonly standingsAgent: StandingsProjectionAgent;

  /**
   * @param db - Kysely database instance
   * @param logger - Optional Pino logger
   * @param espnAdapter - Optional pre-constructed ESPNAdapter (enables injection for testing)
   * @param standingsAgent - Optional pre-constructed StandingsProjectionAgent (enables injection for testing)
   */
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger?: BaseLogger,
    espnAdapter?: ESPNAdapter,
    standingsAgent?: StandingsProjectionAgent,
  ) {
    this.espnAdapter = espnAdapter ?? new ESPNAdapter(logger);
    this.standingsAgent =
      standingsAgent ?? new StandingsProjectionAgent(db, logger);
  }

  /**
   * Execute daily snapshot job
   */
  async executeSnapshot(options: SnapshotJobOptions): Promise<void> {
    const { leagueId, snapshotDate, espnAuth, forceFresh } = options;

    this.logger?.info({ leagueId, snapshotDate }, "Starting snapshot job");

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
      const league = await this.db
        .selectFrom("league")
        .selectAll()
        .where("id", "=", leagueId)
        .executeTakeFirstOrThrow();

      const { espnData, normalized } = await this.fetchAndArchive(
        leagueId,
        league,
        espnAuth,
        snapshotDate,
      );
      const settingsVersionId = await this.getOrCreateSettingsVersion(
        leagueId,
        snapshotDate,
        normalized.settings,
      );
      const projectionsRun = await this.db
        .selectFrom("projections_run")
        .selectAll()
        .where("as_of_date", "<=", snapshotDate)
        .orderBy("as_of_date", "desc")
        .executeTakeFirst();
      const { isDegraded, degradedReasons } = computeDegradedStatus(
        projectionsRun,
        snapshotDate,
      );

      await this.db
        .transaction()
        .execute((trx) =>
          this.writeSnapshotRows(
            trx,
            leagueId,
            snapshotDate,
            espnData,
            normalized,
            settingsVersionId,
            projectionsRun,
            isDegraded,
            degradedReasons,
          ),
        );

      await this.computeProjections(leagueId, snapshotDate, projectionsRun?.id);

      try {
        await this.fetchAndStoreFreeAgents(
          league.espn_league_id,
          league.season,
          espnAuth,
          leagueId,
          snapshotDate,
        );
      } catch (err) {
        this.logger?.warn(
          { err, leagueId, snapshotDate },
          "Free agent fetch failed — non-fatal",
        );
      }

      await this.emitChangeLog(leagueId, snapshotDate);

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

  private async fetchAndArchive(
    leagueId: number,
    league: { espn_league_id: number; season: number },
    espnAuth: ESPNAuthCookies | undefined,
    snapshotDate: string,
  ): Promise<{
    espnData: Awaited<ReturnType<ESPNAdapter["fetchLeague"]>>;
    normalized: ReturnType<ESPNAdapter["normalizeLeagueData"]>;
  }> {
    void snapshotDate;
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

    const normalized = this.espnAdapter.normalizeLeagueData(espnData.data);
    return { espnData, normalized };
  }

  private async writeSnapshotRows(
    trx: Kysely<Database>,
    leagueId: number,
    snapshotDate: string,
    espnData: { data: unknown },
    normalized: ReturnType<ESPNAdapter["normalizeLeagueData"]>,
    settingsVersionId: number,
    projectionsRun: { id: number } | undefined,
    isDegraded: boolean,
    degradedReasons: string[],
  ): Promise<void> {
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

    const espnTeamIdToDbId = new Map<number, number>();
    if (normalized.teams.length > 0) {
      const teamRows = normalized.teams.map((team) => ({
        league_id: leagueId,
        espn_team_id: team.id,
        name: team.name,
        faab_spent: team.faabSpent ?? 0,
        created_at: new Date(),
      }));
      const upsertedTeams = await trx
        .insertInto("team")
        .values(teamRows)
        .onConflict((oc) =>
          oc.columns(["league_id", "espn_team_id"]).doUpdateSet((eb) => ({
            name: eb.ref("excluded.name"),
            faab_spent: eb.ref("excluded.faab_spent"),
          })),
        )
        .returning(["id", "espn_team_id"])
        .execute();
      for (const row of upsertedTeams) {
        espnTeamIdToDbId.set(row.espn_team_id, row.id);
      }
    }

    await this.writePlayersAndRosters(
      trx,
      leagueId,
      snapshotDate,
      normalized.teams,
      espnTeamIdToDbId,
    );
    await this.writeFreeAgentPlayers(trx, normalized.freeAgents || []);

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
  }

  private async computeProjections(
    leagueId: number,
    snapshotDate: string,
    projectionsRunId: number | undefined,
  ): Promise<void> {
    if (!projectionsRunId) return;
    await this.standingsAgent.computeProjectedStandings(
      leagueId,
      snapshotDate,
      projectionsRunId,
    );
  }

  private async emitChangeLog(
    leagueId: number,
    snapshotDate: string,
  ): Promise<void> {
    try {
      const logger = this.logger ?? pino();
      const changeLogAgent = new StandingsChangeLogAgent(this.db, logger);
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
      components_json: StatComponents | null;
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
          components_json: cat.formulaId
            ? buildCurrentComponents(cat.formulaId, team.statValues)
            : null,
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

  private async fetchAndStoreFreeAgents(
    espnLeagueId: number,
    season: number,
    auth: ESPNAuthCookies | undefined,
    leagueId: number,
    snapshotDate: string,
  ): Promise<void> {
    const freeAgents = await this.espnAdapter.fetchFreeAgents({
      leagueId: espnLeagueId,
      season,
      auth,
      limit: 300,
    });

    if (freeAgents.length === 0) {
      this.logger?.info(
        { leagueId, snapshotDate },
        "No free agents returned from ESPN",
      );
      return;
    }

    for (const fa of freeAgents) {
      await this.db
        .insertInto("player")
        .values({
          id: fa.playerId,
          name: fa.name,
          mlb_team: fa.mlbTeam,
          positions: fa.positions,
          created_at: new Date(),
        } as any)
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            name: fa.name,
            mlb_team: fa.mlbTeam,
            positions: fa.positions,
          }),
        )
        .execute();

      await this.db
        .insertInto("league_free_agent_snapshot")
        .values({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          player_id: fa.playerId,
          ownership_pct: fa.pctOwned,
          started_pct: fa.pctStarted,
          created_at: new Date(),
        })
        .onConflict((oc) =>
          oc.columns(["league_id", "snapshot_date", "player_id"]).doUpdateSet({
            ownership_pct: fa.pctOwned,
            started_pct: fa.pctStarted,
          }),
        )
        .execute();
    }

    this.logger?.info(
      { leagueId, snapshotDate, freeAgentCount: freeAgents.length },
      "Free agents stored in league_free_agent_snapshot",
    );
  }

  /**
   * Write per-player period stats from raw ESPN team data.
   *
   * Delegates ESPN stat-ID → component-key parsing to EspnDataNormalizer.parsePlayerPeriodComponents.
   * Only COUNTING stats are stored; rate stats (AVG, ERA, WHIP) are computed at read time.
   * Skips IL (lineupSlotId=17) and NA (lineupSlotId=19) players.
   */
  private async writePlayerPeriodStats(
    trx: Kysely<Database>,
    leagueId: number,
    snapshotDate: string,
    rawTeams: any[],
    espnTeamIdToDbId: Map<number, number>,
    scoringPeriodId: number,
  ): Promise<void> {
    // Parse components via normalizer (ESPN-specific parsing lives there)
    const componentsByEspnPlayerId =
      this.espnAdapter.parsePlayerPeriodComponents(rawTeams, scoringPeriodId);

    if (componentsByEspnPlayerId.size === 0) return;

    const espnPlayerIds = Array.from(componentsByEspnPlayerId.keys());

    // After migration 016, player.id IS the ESPN player ID
    const playerRows = await trx
      .selectFrom("player")
      .select(["id"])
      .where("id", "in", espnPlayerIds)
      .execute();

    const knownPlayerIds = new Set(playerRows.map((r) => r.id));

    let storedCount = 0;

    for (const rawTeam of rawTeams) {
      const espnTeamId = rawTeam.id as number;
      const dbTeamId = espnTeamIdToDbId.get(espnTeamId);
      if (!dbTeamId) continue;

      const entries = rawTeam.roster?.entries || [];
      for (const entry of entries) {
        const lineupSlotId = entry.lineupSlotId ?? -1;
        if (lineupSlotId === 17 || lineupSlotId === 19) continue;

        const espnPlayerId =
          entry.playerId ?? entry.playerPoolEntry?.player?.id;
        if (!espnPlayerId || !knownPlayerIds.has(espnPlayerId)) continue;

        const components = componentsByEspnPlayerId.get(espnPlayerId);
        if (!components) continue;

        await trx
          .insertInto("player_period_stats")
          .values({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            scoring_period: scoringPeriodId,
            player_id: espnPlayerId,
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
