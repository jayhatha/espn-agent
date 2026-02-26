import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import crypto from "crypto";
import { ESPNAdapter, type ESPNAuthCookies, type ESPNTeamData, type ESPNScoringCategory, ESPN_STAT_MAP } from "../adapters/espn.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { calculateFinalRate } from "../../../shared/dist/index.js";

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
  prefetchedData?: any; // Pre-fetched ESPN response data (used by backfill to avoid re-fetching)
}

export class SnapshotOrchestratorAgent {
  private espnAdapter: ESPNAdapter;
  private standingsAgent: StandingsProjectionAgent;

  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {
    this.espnAdapter = new ESPNAdapter(logger);
    this.standingsAgent = new StandingsProjectionAgent(db, logger);
  }

  /**
   * Normalize ESPN injury status to simplified format
   */
  private normalizeInjuryStatus(espnStatus: string | null | undefined): string | null {
    if (!espnStatus) return null;

    const status = espnStatus.toUpperCase();
    if (status.includes('INJURY_RESERVE') || status.includes('IL') || status.includes('INJURED_LIST')) {
      return 'IL';
    }
    if (status.includes('DAY_TO_DAY') || status.includes('DTD') || status.includes('QUESTIONABLE')) {
      return 'DTD';
    }
    if (status.includes('OUT') || status.includes('SUSPENDED')) {
      return 'OUT';
    }
    // If healthy or unknown status, return null
    return null;
  }

  /**
   * Execute daily snapshot job
   */
  async executeSnapshot(options: SnapshotJobOptions): Promise<void> {
    const { leagueId, snapshotDate, espnAuth, forceFresh, prefetchedData } = options;

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

      // 2. Use pre-fetched data (backfill) or fetch fresh from ESPN
      let rawData: any;
      if (prefetchedData) {
        rawData = prefetchedData;
        this.logger?.info({ leagueId, snapshotDate }, "Using pre-fetched ESPN data");
      } else {
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
        rawData = espnData.data;

        // Archive raw payload (only for fresh fetches, not backfill)
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
            } as any,
            response_json: espnData.data as any,
            schema_fingerprint: espnData.schemaFingerprint,
          })
          .execute();
      }

      // 3. Normalize data
      const normalized = this.espnAdapter.normalizeLeagueData(rawData);

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

      // 8. Fetch free agents and transactions in parallel (non-blocking)
      // Build espnTeamIdToDbId map outside the transaction for use here
      const teamIdMap = new Map<number, number>();
      for (const team of normalized.teams) {
        const dbTeam = await this.db
          .selectFrom("team")
          .select("id")
          .where("league_id", "=", leagueId)
          .where("espn_team_id", "=", team.id)
          .executeTakeFirst();
        if (dbTeam) teamIdMap.set(team.id, dbTeam.id);
      }

      const [freeAgentResult, transactionResult] = await Promise.allSettled([
        this.fetchAndStoreFreeAgents(league.espn_league_id, league.season, espnAuth, leagueId, snapshotDate),
        this.fetchAndStoreTransactions(league.espn_league_id, league.season, espnAuth, leagueId, snapshotDate, teamIdMap),
      ]);

      // If free agent fetch failed, mark snapshot as degraded
      if (freeAgentResult.status === "rejected") {
        this.logger?.warn(
          { error: freeAgentResult.reason, leagueId },
          "Free agent fetch failed, marking snapshot as degraded",
        );
        const currentReasons = [...degradedReasons, "free_agents_failed"];
        await this.db
          .updateTable("league_daily_snapshot")
          .set({
            is_degraded: true,
            degraded_reasons: currentReasons,
          })
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", snapshotDate)
          .execute();
      }

      // Track transaction count in snapshot metadata
      let transactionCount = 0;
      if (transactionResult.status === "fulfilled") {
        transactionCount = transactionResult.value || 0;
      } else {
        // Transaction fetch failed, just log a warning (non-blocking)
        this.logger?.warn(
          { error: transactionResult.reason, leagueId },
          "Transaction fetch failed, continuing without transactions",
        );
      }

      this.logger?.info(
        { leagueId, snapshotDate, transactionCount },
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
        // Normalize injury status from ESPN
        const injuryStatus = this.normalizeInjuryStatus(entry.injuryStatus);

        // Check if player exists to detect injury status changes
        const existingPlayer = await trx
          .selectFrom("player")
          .select(["id", "injury_status"])
          .where("espn_player_id", "=", entry.espnPlayerId)
          .executeTakeFirst();

        // Upsert player with injury status
        const playerResult = await trx
          .insertInto("player")
          .values({
            espn_player_id: entry.espnPlayerId,
            name: entry.name,
            mlb_team: entry.mlbTeam,
            positions: entry.positions,
            injury_status: injuryStatus,
            injury_updated_at: injuryStatus ? new Date() : undefined,
            created_at: new Date(),
          })
          .onConflict((oc) =>
            oc.column("espn_player_id").doUpdateSet({
              name: entry.name,
              mlb_team: entry.mlbTeam,
              positions: entry.positions,
              injury_status: injuryStatus,
              injury_updated_at: injuryStatus ? new Date() : undefined,
            }),
          )
          .returning("id")
          .executeTakeFirstOrThrow();

        // Track injury status changes in injury_event table
        if (existingPlayer && existingPlayer.injury_status !== injuryStatus) {
          // Status changed - record event
          await trx
            .insertInto("injury_event")
            .values({
              player_id: playerResult.id,
              event_date: snapshotDate,
              injury_status: injuryStatus || 'HEALTHY',
              notes: `Status changed from ${existingPlayer.injury_status || 'HEALTHY'} to ${injuryStatus || 'HEALTHY'}`,
              created_at: new Date(),
            })
            .execute();

          this.logger?.debug(
            { playerId: playerResult.id, playerName: entry.name, oldStatus: existingPlayer.injury_status, newStatus: injuryStatus },
            "Injury status changed"
          );
        } else if (!existingPlayer && injuryStatus) {
          // New player with injury status - record event
          await trx
            .insertInto("injury_event")
            .values({
              player_id: playerResult.id,
              event_date: snapshotDate,
              injury_status: injuryStatus,
              notes: `Initial injury status: ${injuryStatus}`,
              created_at: new Date(),
            })
            .execute();
        }

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

    // Rank teams per category and compute roto points (with tie handling)
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

      // Assign ranks and roto points with tie handling:
      // Tied teams share the average of the positions they occupy.
      const ranked = this.assignRanksWithTies(teamValues, numTeams);

      for (const { dbTeamId, rank, rotoPoints } of ranked) {
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

    // Write overall standings (with tie handling for overall rank)
    const overallRankings = Array.from(teamOverallPoints.entries())
      .map(([teamId, points]) => ({ teamId, points }))
      .sort((a, b) => b.points - a.points);

    for (let i = 0; i < overallRankings.length; i++) {
      // Compute overall rank with ties
      let rank = i + 1;
      if (i > 0 && overallRankings[i].points === overallRankings[i - 1].points) {
        // Find the first team with this point total to get the tied rank
        let j = i;
        while (j > 0 && overallRankings[j - 1].points === overallRankings[i].points) j--;
        rank = j + 1;
      }

      await trx
        .insertInto("team_daily_overall")
        .values({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          team_id: overallRankings[i].teamId,
          overall_points: overallRankings[i].points,
          overall_rank: rank,
        })
        .execute();
    }

    this.logger?.info(
      { leagueId, numCategories: categories.length, numTeams },
      "Current standings written",
    );
  }

  /**
   * Write current standings by accumulating per-period player stats
   * Used by historical backfill to produce accurate week-by-week standings
   *
   * Extracts statSplitTypeId=5 (per-period) player stats from all rostered players
   * (excluding IL/NA), aggregates to team-level, and computes rate stats via component math
   */
  async writeCurrentStandingsFromPlayerStats(
    trx: Kysely<Database>,
    leagueId: number,
    snapshotDate: string,
    rawTeamsData: any[],
    espnTeamIdToDbId: Map<number, number>,
    categories: ESPNScoringCategory[],
    scoringPeriodId: number,
    previousSnapshotDate?: string,
    benchCountsForStats: boolean = true,
    storePlayerStats: boolean = false,
  ): Promise<void> {
    // Fetch previous snapshot's cumulative totals BEFORE deleting current snapshot.
    // When accumulating within the same week (previousSnapshotDate === snapshotDate),
    // we must read the prior data before it gets deleted.
    const priorComponentsMap = new Map<number, Record<string, number>>();

    if (previousSnapshotDate) {
      const priorRows = await trx
        .selectFrom("team_daily_category_totals")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", previousSnapshotDate)
        .execute();

      // Store prior components per team (components_json is the same for all categories of a team)
      for (const row of priorRows) {
        if (!priorComponentsMap.has(row.team_id) && row.components_json) {
          priorComponentsMap.set(
            row.team_id,
            row.components_json as Record<string, number>,
          );
        }
      }

      this.logger?.debug(
        { leagueId, previousSnapshotDate, teamsWithPrior: priorComponentsMap.size },
        "Fetched prior cumulative components for accumulation",
      );
    }

    // Delete existing standings for this snapshot (after reading prior data)
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

    // Process each team
    const teamCategoryValues: Array<{
      dbTeamId: number;
      categoryValues: Map<string, number>;
      components: Record<string, number>;
    }> = [];

    for (const team of rawTeamsData) {
      const dbTeamId = espnTeamIdToDbId.get(team.id);
      if (!dbTeamId) continue;

      // Get counting roster entries — exclude IL (17) and NA (19) always.
      // For leagues with daily lineups (lineupLocktimeType=INDIVIDUAL_GAME),
      // also exclude bench (16) since only active lineup stats count.
      const rosterEntries = team.roster?.entries || [];
      const maxSlotId = benchCountsForStats ? 16 : 15;
      const countingRoster = rosterEntries.filter(
        (entry: any) => entry.lineupSlotId !== undefined && entry.lineupSlotId <= maxSlotId
      );

      // Accumulate this week's components from all counting players
      const weekComponents: Record<string, number> = {};

      for (const entry of countingRoster) {
        // Find per-period stats (statSplitTypeId=5)
        const playerStats = entry.playerPoolEntry?.player?.stats || [];
        const periodStats = playerStats.find(
          (s: any) => s.scoringPeriodId === scoringPeriodId && s.statSplitTypeId === 5
        );

        if (!periodStats || !periodStats.stats) {
          continue;
        }

        for (const [espnStatIdStr, value] of Object.entries(periodStats.stats)) {
          const espnStatId = parseInt(espnStatIdStr, 10);
          const statInfo = ESPN_STAT_MAP[espnStatId];

          if (!statInfo) continue;

          // Only accumulate COUNTING stats as components — skip RATE stats
          // (AVG, OBP, SLG, OPS, ERA, WHIP, K9, WPCT) which ESPN includes
          // in per-period stats but should not be summed across players/weeks
          if (statInfo.type !== "COUNTING") continue;

          const statKey = statInfo.key;
          const statValue = typeof value === "number" ? value : 0;

          if (statKey === "OUTS") {
            const ip = statValue / 3;
            weekComponents.IP = (weekComponents.IP || 0) + ip;
          } else {
            weekComponents[statKey] = (weekComponents[statKey] || 0) + statValue;
          }
        }
      }

      // Debug logging for week components
      this.logger?.debug(
        { teamId: team.id, scoringPeriodId, rosterCount: countingRoster.length, weekComponentKeys: Object.keys(weekComponents), sampleStats: { R: weekComponents.R, HR: weekComponents.HR, RBI: weekComponents.RBI } },
        "Week components computed for team",
      );

      // Build cumulative components: prior + this week
      const priorComponents = priorComponentsMap.get(dbTeamId) || {};
      const cumulativeComponents: Record<string, number> = {};
      const allKeys = new Set([...Object.keys(priorComponents), ...Object.keys(weekComponents)]);
      for (const key of allKeys) {
        cumulativeComponents[key] = (priorComponents[key] || 0) + (weekComponents[key] || 0);
      }

      // Compute category values from cumulative components
      const categoryValues = new Map<string, number>();

      for (const cat of categories) {
        let value = 0;

        if (cat.type === "COUNTING") {
          value = cumulativeComponents[cat.statKey] || 0;
        } else if (cat.type === "RATE" && cat.formulaId) {
          const isPitchingRate = ["era", "whip", "k9"].includes(cat.formulaId.toLowerCase());

          if (isPitchingRate) {
            const pitchingRateComponents = {
              H: cumulativeComponents.HA || 0,
              BB: cumulativeComponents.BBA || 0,
              IP: cumulativeComponents.IP || 0,
              ER: cumulativeComponents.ER || 0,
              K: cumulativeComponents.K || 0,
            };
            if (pitchingRateComponents.IP > 0) {
              value = calculateFinalRate(cat.formulaId, {}, pitchingRateComponents);
            }
          } else {
            value = calculateFinalRate(cat.formulaId, {}, cumulativeComponents);
          }
        }

        categoryValues.set(cat.statKey, value);
      }

      teamCategoryValues.push({ dbTeamId, categoryValues, components: cumulativeComponents });
    }

    // Store per-player per-period stats for transaction impact analysis
    if (storePlayerStats) {
      // Build espnPlayerId → dbPlayerId lookup from all roster entries
      const allEspnPlayerIds: number[] = [];
      for (const team of rawTeamsData) {
        const entries = team.roster?.entries || [];
        for (const entry of entries) {
          const espnPlayerId = entry.playerPoolEntry?.playerId ?? entry.playerId;
          if (espnPlayerId) allEspnPlayerIds.push(espnPlayerId);
        }
      }

      const espnPlayerIdToDbId = new Map<number, number>();
      if (allEspnPlayerIds.length > 0) {
        const playerRows = await trx
          .selectFrom("player")
          .select(["id", "espn_player_id"])
          .where("espn_player_id", "in", allEspnPlayerIds)
          .execute();
        for (const row of playerRows) {
          espnPlayerIdToDbId.set(row.espn_player_id, row.id);
        }
      }

      // Collect per-player stats from ALL roster entries (including bench for counterfactual)
      // Exclude only IL (17) and NA (19)
      const playerRows: Array<{
        league_id: number;
        snapshot_date: string;
        scoring_period: number;
        player_id: number;
        team_id: number;
        lineup_slot_id: number | null;
        components_json: Record<string, number>;
      }> = [];

      for (const team of rawTeamsData) {
        const dbTeamId = espnTeamIdToDbId.get(team.id);
        if (!dbTeamId) continue;

        const entries = team.roster?.entries || [];
        for (const entry of entries) {
          // Skip IL (17) and NA (19) — they don't have meaningful stats
          if (entry.lineupSlotId === 17 || entry.lineupSlotId === 19) continue;

          const espnPlayerId = entry.playerPoolEntry?.playerId ?? entry.playerId;
          const dbPlayerId = espnPlayerIdToDbId.get(espnPlayerId);
          if (!dbPlayerId) continue;

          const playerStats = entry.playerPoolEntry?.player?.stats || [];
          const periodStats = playerStats.find(
            (s: any) => s.scoringPeriodId === scoringPeriodId && s.statSplitTypeId === 5
          );

          if (!periodStats || !periodStats.stats) continue;

          const components: Record<string, number> = {};
          for (const [espnStatIdStr, value] of Object.entries(periodStats.stats)) {
            const espnStatId = parseInt(espnStatIdStr, 10);
            const statInfo = ESPN_STAT_MAP[espnStatId];
            if (!statInfo || statInfo.type !== "COUNTING") continue;

            const statValue = typeof value === "number" ? value : 0;
            if (statInfo.key === "OUTS") {
              components.IP = (components.IP || 0) + statValue / 3;
            } else {
              components[statInfo.key] = (components[statInfo.key] || 0) + statValue;
            }
          }

          // Only store if the player had any stats this period
          if (Object.keys(components).length > 0) {
            playerRows.push({
              league_id: leagueId,
              snapshot_date: snapshotDate,
              scoring_period: scoringPeriodId,
              player_id: dbPlayerId,
              team_id: dbTeamId,
              lineup_slot_id: entry.lineupSlotId ?? null,
              components_json: components,
            });
          }
        }
      }

      // Batch upsert per-player stats
      if (playerRows.length > 0) {
        for (const row of playerRows) {
          await trx
            .insertInto("player_period_stats")
            .values(row as any)
            .onConflict((oc) =>
              oc.columns(["league_id", "scoring_period", "player_id"]).doUpdateSet({
                snapshot_date: row.snapshot_date,
                team_id: row.team_id,
                lineup_slot_id: row.lineup_slot_id,
                components_json: row.components_json as any,
              }),
            )
            .execute();
        }

        this.logger?.debug(
          { leagueId, scoringPeriodId, playerStatsStored: playerRows.length },
          "Per-player period stats stored",
        );
      }
    }

    // Write category totals for each team
    for (const { dbTeamId, categoryValues, components } of teamCategoryValues) {
      for (const cat of categories) {
        const value = categoryValues.get(cat.statKey) || 0;
        await trx
          .insertInto("team_daily_category_totals")
          .values({
            league_id: leagueId,
            snapshot_date: snapshotDate,
            team_id: dbTeamId,
            category_id: cat.statKey,
            value,
            components_json: components as any,
          })
          .execute();
      }
    }

    // Rank teams per category and compute roto points (with tie handling)
    const numTeams = teamCategoryValues.length;
    const teamOverallPoints = new Map<number, number>();

    for (const cat of categories) {
      const teamValues = teamCategoryValues.map((tv) => ({
        dbTeamId: tv.dbTeamId,
        value: tv.categoryValues.get(cat.statKey) || 0,
      }));

      // Sort by direction
      teamValues.sort((a, b) =>
        cat.direction === "LOWER_BETTER"
          ? a.value - b.value
          : b.value - a.value,
      );

      // Assign ranks and roto points with tie handling
      const ranked = this.assignRanksWithTies(teamValues, numTeams);

      for (const { dbTeamId, rank, rotoPoints } of ranked) {
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

    // Write overall standings (with tie handling for overall rank)
    const overallRankings = Array.from(teamOverallPoints.entries())
      .map(([teamId, points]) => ({ teamId, points }))
      .sort((a, b) => b.points - a.points);

    for (let i = 0; i < overallRankings.length; i++) {
      let rank = i + 1;
      if (i > 0 && overallRankings[i].points === overallRankings[i - 1].points) {
        let j = i;
        while (j > 0 && overallRankings[j - 1].points === overallRankings[i].points) j--;
        rank = j + 1;
      }

      await trx
        .insertInto("team_daily_overall")
        .values({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          team_id: overallRankings[i].teamId,
          overall_points: overallRankings[i].points,
          overall_rank: rank,
        })
        .execute();
    }

    this.logger?.info(
      { leagueId, scoringPeriodId, numCategories: categories.length, numTeams },
      "Per-period standings written from player stats",
    );
  }

  /**
   * Assign ranks and roto points with tie handling.
   * Tied teams (same value) share the average of the positions they occupy.
   * e.g. Two teams tied for 1st in a 10-team league: each gets (10+9)/2 = 9.5 points.
   * Input must already be sorted in the desired ranking order.
   */
  private assignRanksWithTies(
    sorted: Array<{ dbTeamId: number; value: number }>,
    numTeams: number,
  ): Array<{ dbTeamId: number; rank: number; rotoPoints: number }> {
    const result: Array<{ dbTeamId: number; rank: number; rotoPoints: number }> = [];
    let i = 0;
    while (i < sorted.length) {
      // Find the group of teams tied at this value
      let j = i;
      while (j < sorted.length && sorted[j].value === sorted[i].value) {
        j++;
      }
      // Positions i..j-1 are tied. Rank = i+1 (first position in the group).
      // Roto points = average of (numTeams - pos) for pos = i..j-1
      const tiedCount = j - i;
      let totalPoints = 0;
      for (let k = i; k < j; k++) {
        totalPoints += numTeams - k; // numTeams - rank + 1 where rank = k+1
      }
      const sharedPoints = totalPoints / tiedCount;
      const rank = i + 1;

      for (let k = i; k < j; k++) {
        result.push({ dbTeamId: sorted[k].dbTeamId, rank, rotoPoints: sharedPoints });
      }
      i = j;
    }
    return result;
  }

  private async getOrCreateSettingsVersion(
    leagueId: number,
    effectiveDate: string,
    settings: any,
  ): Promise<number> {
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

    const settingsJson: any = {
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
            settings_json: settingsJson as any,
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
        settings_json: settingsJson as any,
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
        })
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
   * Fetch free agents from ESPN and store in player table with ownership data
   * Non-blocking: failure does not stop the snapshot pipeline
   */
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

    // Store free agent players in the player table and track in snapshot
    for (const fa of freeAgents) {
      // Upsert player
      const playerResult = await this.db
        .insertInto("player")
        .values({
          espn_player_id: fa.playerId,
          name: fa.name,
          mlb_team: fa.mlbTeam,
          positions: fa.positions,
          created_at: new Date(),
        })
        .onConflict((oc) =>
          oc.column("espn_player_id").doUpdateSet({
            name: fa.name,
            mlb_team: fa.mlbTeam,
            positions: fa.positions,
          }),
        )
        .returning("id")
        .executeTakeFirstOrThrow();

      // Store in free agent snapshot table
      await this.db
        .insertInto("league_free_agent_snapshot")
        .values({
          league_id: leagueId,
          snapshot_date: snapshotDate,
          player_id: playerResult.id,
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
      "Free agents fetched and stored in snapshot",
    );
  }

  /**
   * Fetch transactions from ESPN and upsert into league_transaction_event
   * Non-blocking: failure does not stop the snapshot pipeline
   * Returns the count of new transactions ingested
   */
  private async fetchAndStoreTransactions(
    espnLeagueId: number,
    season: number,
    auth: ESPNAuthCookies | undefined,
    leagueId: number,
    snapshotDate: string,
    espnTeamIdToDbId: Map<number, number>,
  ): Promise<number> {
    const transactions = await this.espnAdapter.fetchTransactions({
      leagueId: espnLeagueId,
      season,
      auth,
    });

    if (transactions.length === 0) {
      this.logger?.info({ leagueId }, "No transactions to ingest");
      return 0;
    }

    let newTransactions = 0;

    for (const txn of transactions) {
      // Determine primary team from first item's toTeamId or fromTeamId
      const primaryItem = txn.items[0];
      if (!primaryItem) continue;

      const primaryEspnTeamId = primaryItem.toTeamId ?? primaryItem.fromTeamId;
      if (primaryEspnTeamId === null) continue;

      const dbTeamId = espnTeamIdToDbId.get(primaryEspnTeamId);
      if (!dbTeamId) {
        this.logger?.debug(
          { espnTeamId: primaryEspnTeamId, transactionId: txn.transactionId },
          "Skipping transaction: team not found in league",
        );
        continue;
      }

      // Map event type to schema format
      const eventType = txn.type.toLowerCase() as "add" | "drop" | "trade" | "waiver" | "other";

      // Determine counterparty for trades
      let counterpartyDbTeamId: number | null = null;
      if (txn.type === "TRADE") {
        for (const item of txn.items) {
          const otherTeamId: number | null = item.fromTeamId !== primaryEspnTeamId
            ? item.fromTeamId
            : item.toTeamId;
          if (otherTeamId !== null && otherTeamId !== primaryEspnTeamId) {
            counterpartyDbTeamId = espnTeamIdToDbId.get(otherTeamId) ?? null;
            break;
          }
        }
      }

      // Collect player IDs for added/dropped
      const playersAdded = txn.items
        .filter((i) => i.action === "ADD" || i.action === "TRADE_IN")
        .map((i) => i.playerId);
      const playersDropped = txn.items
        .filter((i) => i.action === "DROP" || i.action === "TRADE_OUT")
        .map((i) => i.playerId);

      const eventTime = new Date(txn.timestamp);
      const eventDate = eventTime.toISOString().split("T")[0];
      const rawEventJson = {
        transactionId: txn.transactionId,
        type: txn.type,
        items: txn.items,
        bidAmount: txn.bidAmount,
      };
      const payloadHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(rawEventJson))
        .digest("hex")
        .substring(0, 16);

      try {
        await this.db
          .insertInto("league_transaction_event")
          .values({
            league_id: leagueId,
            event_time: eventTime,
            event_date: eventDate,
            event_type: eventType,
            team_id: dbTeamId,
            counterparty_team_id: counterpartyDbTeamId,
            players_added: playersAdded,
            players_dropped: playersDropped,
            espn_event_id: txn.transactionId,
            payload_hash: payloadHash,
            raw_event_json: rawEventJson as any,
          })
          .onConflict((oc) =>
            oc
              .columns(["league_id", "event_time", "team_id", "payload_hash"])
              .doNothing(),
          )
          .execute();

        newTransactions++;
      } catch (err) {
        // Log individual transaction insert failures but continue
        this.logger?.debug(
          { err, transactionId: txn.transactionId },
          "Failed to insert transaction (may already exist)",
        );
      }
    }

    this.logger?.info(
      { leagueId, snapshotDate, totalTransactions: transactions.length, newTransactions },
      "Transactions ingested",
    );

    return newTransactions;
  }
}
