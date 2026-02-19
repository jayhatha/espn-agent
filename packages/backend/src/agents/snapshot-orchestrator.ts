import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import crypto from "crypto";
import { ESPNAdapter, type ESPNAuthCookies, type ESPNTeamData, type ESPNScoringCategory, type ESPNFreeAgent, type ESPNTransaction } from "../adapters/espn.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { decryptToken, hasEncryptionKey } from "../utils/encryption.js";

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
    private logger?: Logger,
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
          } as any,
          response_json: espnData.data as any,
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
        await this.writeFreeAgentPlayers(trx, normalized.freeAgents);

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

      // If transaction fetch failed, just log a warning (non-blocking)
      if (transactionResult.status === "rejected") {
        this.logger?.warn(
          { error: transactionResult.reason, leagueId },
          "Transaction fetch failed, continuing without transactions",
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
          })
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
    const latest = await this.db
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

    // Store free agent players in the player table
    for (const fa of freeAgents) {
      await this.db
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
        .execute();
    }

    this.logger?.info(
      { leagueId, snapshotDate, freeAgentCount: freeAgents.length },
      "Free agents fetched and stored",
    );
  }

  /**
   * Fetch transactions from ESPN and upsert into league_transaction_event
   * Non-blocking: failure does not stop the snapshot pipeline
   */
  private async fetchAndStoreTransactions(
    espnLeagueId: number,
    season: number,
    auth: ESPNAuthCookies | undefined,
    leagueId: number,
    snapshotDate: string,
    espnTeamIdToDbId: Map<number, number>,
  ): Promise<void> {
    const transactions = await this.espnAdapter.fetchTransactions({
      leagueId: espnLeagueId,
      season,
      auth,
    });

    if (transactions.length === 0) {
      this.logger?.info({ leagueId }, "No transactions to ingest");
      return;
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
          const otherTeamId = item.fromTeamId !== primaryEspnTeamId
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
  }
}
