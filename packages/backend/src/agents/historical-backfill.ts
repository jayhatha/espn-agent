import type { BaseLogger } from "pino";
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
    private logger?: BaseLogger,
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

      // Track previous snapshot date for cumulative accumulation
      let previousSnapshotDate: string | undefined = undefined;

      // Determine if bench stats count toward team totals.
      // Leagues with lineupLocktimeType=INDIVIDUAL_GAME have daily lineups
      // where only active lineup slots count. Will be resolved on first ESPN fetch.
      let benchCountsForStats: boolean | undefined = undefined;

      // Cache espnTeamId → dbTeamId map (built once on first week, reused for all)
      let cachedTeamIdMap: Map<number, number> | undefined = undefined;

      // ESPN baseball scoring periods are DAILY (not weekly).
      // Each "week" we show = 7 consecutive daily scoring periods.
      // We fetch all 7 days per week, accumulate stats, and save one weekly snapshot.
      const DAYS_PER_WEEK = 7;

      // Determine the final scoring period to avoid fetching beyond season end.
      // ESPN's game-level API returns currentScoringPeriod.id (e.g. 196 for 2024).
      const finalScoringPeriod = await this.espnAdapter.getFinalScoringPeriod(season);
      this.logger?.info({ finalScoringPeriod, season }, "Resolved final scoring period");

      // Process each week sequentially
      for (let week = startWeek; week <= endWeek; week++) {
        this.logger?.info(
          { leagueId, season, week, progress: `${week - startWeek + 1}/${totalWeeks}` },
          "Processing historical week",
        );

        try {
          // Compute the 7 daily scoring periods for this week
          const firstDay = (week - 1) * DAYS_PER_WEEK + 1;
          let lastDay = week * DAYS_PER_WEEK;

          // Clip to final scoring period so we don't fetch beyond season end
          if (finalScoringPeriod && lastDay > finalScoringPeriod) {
            lastDay = finalScoringPeriod;
          }

          // Skip this week entirely if first day is past season end
          if (finalScoringPeriod && firstDay > finalScoringPeriod) {
            this.logger?.info(
              { week, firstDay, finalScoringPeriod },
              "Skipping week — beyond final scoring period",
            );
            weeksSkipped++;
            continue;
          }

          // Compute snapshot date: April 1 + (week - 1) * 7 days
          const baseDate = new Date(season, 3, 1); // April 1 of the season year
          const daysOffset = (week - 1) * DAYS_PER_WEEK;
          const snapshotDate = new Date(baseDate.getTime() + daysOffset * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

          let latestEspnData: any = null;
          let latestNormalizedData: any = null;

          // Fetch and accumulate each daily scoring period within this week
          for (let day = firstDay; day <= lastDay; day++) {
            this.logger?.debug(
              { leagueId, season, week, day, snapshotDate },
              "Fetching daily scoring period",
            );

            const espnData = await this.espnAdapter.fetchHistoricalWeek({
              leagueId: league.espn_league_id,
              season,
              scoringPeriodId: day,
              auth: espnAuth,
            });

            latestEspnData = espnData;

            if (day === firstDay) {
              // First day of week: set up snapshot infrastructure (roster, raw payload, etc.)
              latestNormalizedData = this.espnAdapter.normalizeLeagueData(espnData.data);

              // Resolve benchCountsForStats on first fetch (once per backfill)
              if (benchCountsForStats === undefined) {
                const rosterSettings = (espnData.data as any)?.settings?.rosterSettings;
                const locktimeType = rosterSettings?.lineupLocktimeType;
                // INDIVIDUAL_GAME = daily lineups; only active lineup counts
                benchCountsForStats = locktimeType !== "INDIVIDUAL_GAME";
                this.logger?.info(
                  { lineupLocktimeType: locktimeType, benchCountsForStats },
                  "Resolved bench stat counting from league settings",
                );
              }

              await this.snapshotOrchestrator.executeSnapshot({
                leagueId,
                snapshotDate,
                espnAuth,
                forceFresh: true,
                prefetchedData: espnData.data,
              } as any);
            }

            // Accumulate this day's per-period player stats into the weekly snapshot.
            // writeCurrentStandingsFromPlayerStats reads previousSnapshotDate's cumulative
            // components, adds this day's stats, and saves to snapshotDate.
            // Day 1: reads previous WEEK's cumulative (or nothing for week 1)
            // Days 2-7: reads current week's snapshot (accumulating within the week)
            const normalizedData = latestNormalizedData || this.espnAdapter.normalizeLeagueData(espnData.data);
            const categories = normalizedData.settings.categories;

            if (categories.length > 0) {
              // Build espnTeamIdToDbId map once, reuse across all days/weeks
              if (!cachedTeamIdMap) {
                cachedTeamIdMap = new Map<number, number>();
                for (const team of normalizedData.teams) {
                  const dbTeam = await this.db
                    .selectFrom("team")
                    .select("id")
                    .where("league_id", "=", leagueId)
                    .where("espn_team_id", "=", team.id)
                    .executeTakeFirst();
                  if (dbTeam) cachedTeamIdMap.set(team.id, dbTeam.id);
                }
              }

              const rawTeams = (espnData.data as any).teams || [];

              await this.db.transaction().execute(async (trx) => {
                await (this.snapshotOrchestrator as any).writeCurrentStandingsFromPlayerStats(
                  trx, leagueId, snapshotDate, rawTeams, cachedTeamIdMap!,
                  categories, day, previousSnapshotDate, benchCountsForStats!,
                  true, // storePlayerStats — capture per-player per-period stats for impact analysis
                );
              });

              // After day 1, point previousSnapshotDate to current week so
              // subsequent days accumulate within the same weekly snapshot
              if (day === firstDay) {
                previousSnapshotDate = snapshotDate;
              }
            }
          }

          // Transaction deduplication from the last day's data
          if (latestEspnData && latestNormalizedData) {
            if (latestNormalizedData.transactions && latestNormalizedData.transactions.length > 0) {
              await this.deduplicateAndInsertTransactions(
                leagueId,
                latestNormalizedData.transactions as any[],
              );
            }
          }

          weeksProcessed++;
          // previousSnapshotDate already set to this week's date after day 1

          // Update progress
          if (onProgress) {
            await onProgress({
              stage: "processing",
              completedWeeks: week - startWeek + 1,
              totalWeeks,
              currentWeek: week,
              percentage: Math.round(((week - startWeek + 1) / totalWeeks) * 100),
              errors: errors.length > 0 ? errors : undefined,
            });
          }
        } catch (error) {
          // Log error and continue to next week (don't abort entire backfill)
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger?.error(
            { error, leagueId, season, week },
            "Failed to process historical week",
          );
          errors.push(`Week ${week}: ${errorMessage}`);
          weeksFailed++;

          // Update progress with error
          if (onProgress) {
            await onProgress({
              stage: "processing",
              completedWeeks: week - startWeek + 1,
              totalWeeks,
              currentWeek: week,
              percentage: Math.round(((week - startWeek + 1) / totalWeeks) * 100),
              errors: errors.length > 0 ? errors : undefined,
            });
          }
        }
      }

      // Correct final snapshot with ESPN's official valuesByStat totals.
      // Per-period stats miss ~1% due to MLB stat corrections not being
      // retroactively applied to splitType=5 data. valuesByStat is ground truth.
      if (previousSnapshotDate && cachedTeamIdMap) {
        try {
          const lastNormalized = this.espnAdapter.normalizeLeagueData(
            (await this.espnAdapter.fetchHistoricalWeek({
              leagueId: league.espn_league_id,
              season,
              scoringPeriodId: finalScoringPeriod || endWeek * 7,
              auth: espnAuth,
            })).data,
          );

          const categories = lastNormalized.settings.categories;
          const countingCatKeys = new Set(
            categories.filter((c) => c.type === "COUNTING").map((c) => c.statKey),
          );

          // Update counting stat values with ESPN ground truth
          let corrected = 0;
          for (const team of lastNormalized.teams) {
            const dbTeamId = cachedTeamIdMap.get(team.id);
            if (!dbTeamId) continue;

            for (const cat of categories) {
              if (!countingCatKeys.has(cat.statKey)) continue;

              const espnValue = team.statValues[cat.espnStatId] ?? 0;
              if (espnValue === 0) continue;

              await this.db
                .updateTable("team_daily_category_totals")
                .set({ value: espnValue })
                .where("league_id", "=", leagueId)
                .where("snapshot_date", "=", previousSnapshotDate)
                .where("team_id", "=", dbTeamId)
                .where("category_id", "=", cat.statKey)
                .execute();
              corrected++;
            }
          }

          // Recompute ranks and overall standings from corrected values
          await this.db
            .deleteFrom("team_daily_category_ranks")
            .where("league_id", "=", leagueId)
            .where("snapshot_date", "=", previousSnapshotDate)
            .execute();
          await this.db
            .deleteFrom("team_daily_overall")
            .where("league_id", "=", leagueId)
            .where("snapshot_date", "=", previousSnapshotDate)
            .execute();

          const numTeams = lastNormalized.teams.length;
          const teamOverallPoints = new Map<number, number>();

          for (const cat of categories) {
            // Read corrected values
            const rows = await this.db
              .selectFrom("team_daily_category_totals")
              .select(["team_id", "value"])
              .where("league_id", "=", leagueId)
              .where("snapshot_date", "=", previousSnapshotDate)
              .where("category_id", "=", cat.statKey)
              .execute();

            // Sort and rank
            const sorted = [...rows].sort((a, b) =>
              cat.direction === "LOWER_BETTER"
                ? a.value - b.value
                : b.value - a.value,
            );

            // Assign ranks with tie handling and build batch insert array
            const categoryRanksRows = [];
            let i = 0;
            while (i < sorted.length) {
              let j = i;
              while (j < sorted.length && sorted[j].value === sorted[i].value) j++;
              const tiedCount = j - i;
              const avgPoints = Array.from({ length: tiedCount }, (_, k) => numTeams - (i + k))
                .reduce((sum, p) => sum + p, 0) / tiedCount;
              for (let k = i; k < j; k++) {
                const rank = i + 1;
                teamOverallPoints.set(
                  sorted[k].team_id,
                  (teamOverallPoints.get(sorted[k].team_id) || 0) + avgPoints,
                );
                categoryRanksRows.push({
                  league_id: leagueId,
                  snapshot_date: previousSnapshotDate,
                  team_id: sorted[k].team_id,
                  category_id: cat.statKey,
                  rank,
                  roto_points: avgPoints,
                });
              }
              i = j;
            }

            // Batch insert category ranks
            if (categoryRanksRows.length > 0) {
              await this.db
                .insertInto("team_daily_category_ranks")
                .values(categoryRanksRows)
                .execute();
            }
          }

          // Write overall standings
          const overallRankings = Array.from(teamOverallPoints.entries())
            .map(([teamId, points]) => ({ teamId, points }))
            .sort((a, b) => b.points - a.points);

          // Build array for batch insert
          const overallRows = [];
          for (let i = 0; i < overallRankings.length; i++) {
            let rank = i + 1;
            if (i > 0 && overallRankings[i].points === overallRankings[i - 1].points) {
              let j = i;
              while (j > 0 && overallRankings[j - 1].points === overallRankings[i].points) j--;
              rank = j + 1;
            }
            overallRows.push({
              league_id: leagueId,
              snapshot_date: previousSnapshotDate,
              team_id: overallRankings[i].teamId,
              overall_points: overallRankings[i].points,
              overall_rank: rank,
            });
          }

          // Batch insert overall standings
          if (overallRows.length > 0) {
            await this.db
              .insertInto("team_daily_overall")
              .values(overallRows)
              .execute();
          }

          this.logger?.info(
            { leagueId, snapshotDate: previousSnapshotDate, corrected },
            "Final snapshot corrected with valuesByStat ground truth",
          );
        } catch (error) {
          this.logger?.warn(
            { error, leagueId },
            "Failed to correct final snapshot with valuesByStat (non-fatal)",
          );
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

      // Auto-finalize season after successful backfill
      if (weeksFailed < totalWeeks) {
        await this.finalizeSeasonIfComplete(leagueId, season, weeksProcessed);
      }

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
   * Mark a season as finalized after successful backfill completion.
   * Finalized seasons skip projection recomputation in SnapshotOrchestratorAgent.
   */
  private async finalizeSeasonIfComplete(
    leagueId: number,
    season: number,
    snapshotCount: number,
  ): Promise<void> {
    await this.db
      .insertInto("season_metadata")
      .values({
        league_id: leagueId,
        season,
        is_finalized: true,
        finalized_at: new Date(),
        snapshot_count: snapshotCount,
      })
      .onConflict((oc) =>
        oc.columns(["league_id", "season"]).doUpdateSet({
          is_finalized: true,
          finalized_at: new Date(),
          snapshot_count: snapshotCount,
        }),
      )
      .execute();

    this.logger?.info(
      { leagueId, season, snapshotCount },
      "Season finalized — future snapshot runs will skip projection recomputation",
    );
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
          })
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
