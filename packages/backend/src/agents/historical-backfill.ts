import type { Logger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import crypto from "crypto";
import { ESPNAdapter, type ESPNAuthCookies } from "../adapters/espn.js";
import { SnapshotOrchestratorAgent } from "./snapshot-orchestrator.js";

/**
 * Historical Backfill Agent
 * Per Phase 07 PLAN.md
 *
 * Fetches and processes historical ESPN league data for past weeks/seasons
 * Includes rate limiting, transaction deduplication, and progress tracking
 */

export interface BackfillProgress {
  stage: "pending" | "fetching" | "processing" | "completed" | "failed";
  completedWeeks: number;
  totalWeeks: number;
  currentWeek: number;
  percentage: number;
  errors?: string[];
}

export interface BackfillResult {
  success: boolean;
  weeksProcessed: number;
  weeksSkipped: number;
  weeksFailed: number;
  errors: string[];
}

export class HistoricalBackfillAgent {
  private espnAdapter: ESPNAdapter;
  private snapshotOrchestrator: SnapshotOrchestratorAgent;

  constructor(
    private db: Kysely<Database>,
    private logger?: Logger,
  ) {
    this.espnAdapter = new ESPNAdapter(logger);
    this.snapshotOrchestrator = new SnapshotOrchestratorAgent(db, logger);
  }

  /**
   * Backfill historical data for a season
   * Processes weeks sequentially with 2-second throttle between ESPN API calls
   */
  async backfillSeason(options: {
    leagueId: number;
    season: number;
    startWeek: number;
    endWeek: number;
    espnAuth?: ESPNAuthCookies;
    onProgress?: (progress: BackfillProgress) => Promise<void>;
  }): Promise<BackfillResult> {
    const { leagueId, season, startWeek, endWeek, espnAuth, onProgress } = options;

    this.logger?.info(
      { leagueId, season, startWeek, endWeek },
      "Starting historical backfill",
    );

    const totalWeeks = endWeek - startWeek + 1;
    let weeksProcessed = 0;
    let weeksSkipped = 0;
    let weeksFailed = 0;
    const errors: string[] = [];

    // Initial progress: fetching stage
    if (onProgress) {
      await onProgress({
        stage: "fetching",
        completedWeeks: 0,
        totalWeeks,
        currentWeek: startWeek,
        percentage: 0,
        errors: [],
      });
    }

    try {
      // Look up league from DB
      const league = await this.db
        .selectFrom("league")
        .select(["id", "espn_league_id", "season"])
        .where("id", "=", leagueId)
        .executeTakeFirstOrThrow();

      // Process each week sequentially
      for (let scoringPeriodId = startWeek; scoringPeriodId <= endWeek; scoringPeriodId++) {
        this.logger?.info(
          { leagueId, season, scoringPeriodId, progress: `${scoringPeriodId - startWeek + 1}/${totalWeeks}` },
          "Processing historical week",
        );

        try {
          // Fetch historical week from ESPN (throttle is inside adapter)
          const espnData = await this.espnAdapter.fetchHistoricalWeek({
            leagueId: league.espn_league_id,
            season,
            scoringPeriodId,
            auth: espnAuth,
          });

          // Compute snapshot date: approximate using April 1 + (week - 1) * 7 days
          // This is a rough heuristic - the important part is unique dates per week
          const baseDate = new Date(season, 3, 1); // April 1 of the season year
          const daysOffset = (scoringPeriodId - 1) * 7;
          const snapshotDate = new Date(baseDate.getTime() + daysOffset * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          // Normalize data
          const normalizedData = this.espnAdapter.normalizeLeagueData(espnData.data);

          // Reuse snapshot orchestrator to write snapshot data, passing pre-fetched data
          // to avoid re-fetching from ESPN (which would return current-state, not historical)
          await this.snapshotOrchestrator.executeSnapshot({
            leagueId,
            snapshotDate,
            espnAuth,
            forceFresh: true,
            prefetchedData: espnData.data,
          });

          // Overwrite standings with per-period player stats accumulation
          // (executeSnapshot uses team-level valuesByStat which returns cumulative totals)
          const categories = normalizedData.settings.categories;

          if (categories.length > 0) {
            // Build espnTeamIdToDbId map
            const espnTeamIdToDbId = new Map<number, number>();
            for (const team of normalizedData.teams) {
              const dbTeam = await this.db
                .selectFrom("team")
                .select("id")
                .where("league_id", "=", leagueId)
                .where("espn_team_id", "=", team.id)
                .executeTakeFirst();
              if (dbTeam) espnTeamIdToDbId.set(team.id, dbTeam.id);
            }

            // Use raw teams data (not normalized) since we need playerPoolEntry.player.stats[]
            const rawTeams = (espnData.data as any).teams || [];

            await this.db.transaction().execute(async (trx) => {
              await this.snapshotOrchestrator.writeCurrentStandingsFromPlayerStats(
                trx, leagueId, snapshotDate, rawTeams, espnTeamIdToDbId,
                categories, scoringPeriodId,
              );
            });
          }

          // Transaction deduplication (if transactions exist in normalized data)
          if (normalizedData.transactions && normalizedData.transactions.length > 0) {
            await this.deduplicateAndInsertTransactions(
              leagueId,
              normalizedData.transactions as any[],
            );
          }

          weeksProcessed++;

          // Update progress
          if (onProgress) {
            await onProgress({
              stage: "processing",
              completedWeeks: scoringPeriodId - startWeek + 1,
              totalWeeks,
              currentWeek: scoringPeriodId,
              percentage: Math.round(((scoringPeriodId - startWeek + 1) / totalWeeks) * 100),
              errors: errors.length > 0 ? errors : undefined,
            });
          }
        } catch (error) {
          // Log error and continue to next week (don't abort entire backfill)
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger?.error(
            { error, leagueId, season, scoringPeriodId },
            "Failed to process historical week",
          );
          errors.push(`Week ${scoringPeriodId}: ${errorMessage}`);
          weeksFailed++;

          // Update progress with error
          if (onProgress) {
            await onProgress({
              stage: "processing",
              completedWeeks: scoringPeriodId - startWeek + 1,
              totalWeeks,
              currentWeek: scoringPeriodId,
              percentage: Math.round(((scoringPeriodId - startWeek + 1) / totalWeeks) * 100),
              errors: errors.length > 0 ? errors : undefined,
            });
          }
        }
      }

      // Final progress: completed or failed
      const finalStage = weeksFailed === totalWeeks ? "failed" : "completed";
      if (onProgress) {
        await onProgress({
          stage: finalStage,
          completedWeeks: totalWeeks,
          totalWeeks,
          currentWeek: endWeek,
          percentage: 100,
          errors: errors.length > 0 ? errors : undefined,
        });
      }

      this.logger?.info(
        { leagueId, season, weeksProcessed, weeksSkipped, weeksFailed },
        "Historical backfill completed",
      );

      return {
        success: weeksFailed < totalWeeks,
        weeksProcessed,
        weeksSkipped,
        weeksFailed,
        errors,
      };
    } catch (error) {
      this.logger?.error({ error, leagueId, season }, "Historical backfill failed");

      if (onProgress) {
        await onProgress({
          stage: "failed",
          completedWeeks: weeksProcessed,
          totalWeeks,
          currentWeek: startWeek,
          percentage: Math.round((weeksProcessed / totalWeeks) * 100),
          errors: [error instanceof Error ? error.message : String(error)],
        });
      }

      throw error;
    }
  }

  /**
   * Deduplicate and insert transactions using SHA-256 hash of canonical fields
   * Prevents duplicate entries on overlapping backfills
   */
  private async deduplicateAndInsertTransactions(
    leagueId: number,
    transactions: any[],
  ): Promise<void> {
    for (const txn of transactions) {
      try {
        // Compute canonical representation for hashing
        const canonical = {
          transactionId: String(txn.id || txn.transactionId),
          type: txn.type,
          timestamp: txn.timestamp || txn.proposedDate || txn.processDate,
          items: (txn.items || [])
            .map((item: any) => ({
              playerId: item.playerId,
              fromTeamId: item.fromTeamId,
              toTeamId: item.toTeamId,
              action: item.action,
            }))
            .sort((a: any, b: any) => a.playerId - b.playerId), // Sort for consistent hash
          bidAmount: txn.bidAmount ?? null,
        };

        // Compute SHA-256 hash and take first 16 characters
        const payloadHash = crypto
          .createHash("sha256")
          .update(JSON.stringify(canonical))
          .digest("hex")
          .substring(0, 16);

        // Determine primary team_id and counterparty (for trades)
        const addItems = canonical.items.filter((item: any) => item.action === "ADD" || item.action === "TRADE_IN");
        const dropItems = canonical.items.filter((item: any) => item.action === "DROP" || item.action === "TRADE_OUT");

        const teamId = addItems[0]?.toTeamId ?? dropItems[0]?.fromTeamId ?? null;
        const counterpartyTeamId = canonical.type === "TRADE"
          ? (dropItems[0]?.toTeamId ?? addItems[0]?.fromTeamId ?? null)
          : null;

        if (!teamId) {
          this.logger?.warn({ txn }, "Transaction has no team_id, skipping");
          continue;
        }

        // Extract player IDs
        const playersAdded = addItems.map((item: any) => item.playerId);
        const playersDropped = dropItems.map((item: any) => item.playerId);

        // Compute event_date from timestamp
        const eventTime = new Date(canonical.timestamp);
        const eventDate = eventTime.toISOString().split("T")[0];

        // Insert with ON CONFLICT DO NOTHING (unique constraint on league_id, event_time, team_id, payload_hash)
        await this.db
          .insertInto("league_transaction_event")
          .values({
            league_id: leagueId,
            event_time: eventTime,
            event_date: eventDate,
            team_id: teamId,
            event_type: canonical.type.toLowerCase(),
            counterparty_team_id: counterpartyTeamId,
            players_added: playersAdded,
            players_dropped: playersDropped,
            espn_event_id: canonical.transactionId,
            raw_event_json: txn,
            payload_hash: payloadHash,
          } as any) // Type assertion: DB auto-generates id (BIGSERIAL)
          .onConflict((oc) =>
            oc.columns(["league_id", "event_time", "team_id", "payload_hash"]).doNothing(),
          )
          .execute();
      } catch (error) {
        this.logger?.warn({ error, txn }, "Failed to insert transaction, skipping");
      }
    }
  }
}
