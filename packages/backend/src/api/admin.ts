import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { getDb } from "../db/connection.js";
import { requireAdmin } from "../middleware/auth.js";
import { backfillQueue } from "../workers/backfill-worker.js";
import { decryptToken, hasEncryptionKey } from "../utils/encryption.js";
import { getEspnAuthFromEnv } from "../utils/espn-env.js";
import {
  ESPNAdapter,
  type ESPNAuthCookies,
  ESPN_STAT_MAP,
  ESPN_LINEUP_SLOT_MAP,
} from "../adapters/espn.js";

/**
 * Admin API Routes
 * User management, system statistics, league health monitoring
 */

export async function adminRoutes(app: FastifyInstance) {
  const db = getDb();

  // GET /api/admin/users - List all users with pagination
  app.get(
    "/api/admin/users",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request: any) => {
      const page = parseInt(request.query.page || "1", 10);
      const limit = parseInt(request.query.limit || "50", 10);
      const offset = (page - 1) * limit;

      // Get total count
      const countResult = await db
        .selectFrom("users")
        .select(db.fn.countAll().as("count"))
        .executeTakeFirst();

      const total = Number(countResult?.count || 0);

      // Get users
      const users = await db
        .selectFrom("users")
        .select([
          "id",
          "email",
          "role",
          "display_name",
          "created_at",
          "last_login_at",
          "oauth_provider",
        ])
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset)
        .execute();

      return {
        users,
        pagination: {
          page,
          limit,
          total,
        },
      };
    },
  );

  // PATCH /api/admin/users/:userId/role - Toggle user role
  app.patch(
    "/api/admin/users/:userId/role",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request: any, reply: any) => {
      const targetUserId = parseInt(request.params.userId, 10);
      const { role } = request.body;

      // Validate role
      if (role !== "user" && role !== "admin") {
        return reply.code(400).send({
          error: "Invalid role",
          message: "Role must be 'user' or 'admin'",
        });
      }

      // Prevent admin from demoting themselves
      if (request.user.userId === targetUserId) {
        return reply.code(400).send({
          error: "Cannot change your own role",
        });
      }

      // Update user role
      await db
        .updateTable("users")
        .set({
          role,
          updated_at: new Date(),
        })
        .where("id", "=", targetUserId)
        .execute();

      // Log role change
      request.log.info(
        {
          adminId: request.user.userId,
          targetUserId,
          newRole: role,
        },
        "User role changed",
      );

      return {
        success: true,
        userId: targetUserId,
        role,
      };
    },
  );

  // GET /api/admin/stats - System overview statistics
  app.get(
    "/api/admin/stats",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async () => {
      // User count
      const userCountResult = await db
        .selectFrom("users")
        .select(db.fn.countAll().as("count"))
        .executeTakeFirst();
      const userCount = Number(userCountResult?.count || 0);

      // League count
      const leagueCountResult = await db
        .selectFrom("league")
        .select(db.fn.countAll().as("count"))
        .executeTakeFirst();
      const leagueCount = Number(leagueCountResult?.count || 0);

      // Latest projection run
      const latestProjection = await db
        .selectFrom("projections_run")
        .select(["id", "as_of_date", "staleness", "ingested_at"])
        .orderBy("ingested_at", "desc")
        .limit(1)
        .executeTakeFirst();

      // Snapshot stats for last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const snapshotStatsResult = await db
        .selectFrom("league_daily_snapshot")
        .select([
          db.fn.countAll().as("total"),
          sql<number>`COUNT(*) FILTER (WHERE is_degraded = false)`.as(
            "healthy",
          ),
          sql<number>`COUNT(*) FILTER (WHERE is_degraded = true)`.as(
            "degraded",
          ),
        ])
        .where("snapshot_date", ">=", sevenDaysAgo)
        .executeTakeFirst();

      const total = Number(snapshotStatsResult?.total || 0);
      const healthy = Number(snapshotStatsResult?.healthy || 0);
      const degraded = Number(snapshotStatsResult?.degraded || 0);
      const successRate = total > 0 ? Math.round((healthy / total) * 100) : 0;

      return {
        userCount,
        leagueCount,
        latestProjection: latestProjection || null,
        snapshotStats: {
          total,
          healthy,
          degraded,
          successRate,
        },
      };
    },
  );

  // GET /api/admin/leagues - League health summary
  app.get(
    "/api/admin/leagues",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async () => {
      // Use CTE to get latest snapshot per league
      const leagues = await db
        .with("latest_snapshots", (qb) =>
          qb
            .selectFrom("league_daily_snapshot")
            .select([
              "league_id",
              sql<string>`MAX(snapshot_date)`.as("max_snapshot_date"),
            ])
            .groupBy("league_id"),
        )
        .selectFrom("league")
        .leftJoin("latest_snapshots", "league.id", "latest_snapshots.league_id")
        .leftJoin("league_daily_snapshot", (join) =>
          join
            .onRef("league.id", "=", "league_daily_snapshot.league_id")
            .onRef(
              "latest_snapshots.max_snapshot_date",
              "=",
              "league_daily_snapshot.snapshot_date",
            ),
        )
        .select([
          "league.id",
          "league.name",
          "league.espn_league_id",
          "league_daily_snapshot.snapshot_date",
          "league_daily_snapshot.is_degraded",
          "league_daily_snapshot.degraded_reasons",
        ])
        .execute();

      // Derive status
      const leaguesWithStatus = leagues.map((league) => {
        let status: "healthy" | "degraded" | "no_snapshot";
        if (!league.snapshot_date) {
          status = "no_snapshot";
        } else if (league.is_degraded) {
          status = "degraded";
        } else {
          status = "healthy";
        }

        return {
          id: league.id,
          name: league.name,
          espnLeagueId: league.espn_league_id,
          snapshotDate: league.snapshot_date,
          isDegraded: league.is_degraded,
          degradedReasons: league.degraded_reasons,
          status,
        };
      });

      return {
        leagues: leaguesWithStatus,
      };
    },
  );

  // POST /api/admin/leagues/:leagueId/backfill - Trigger historical backfill
  app.post(
    "/api/admin/leagues/:leagueId/backfill",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request: any, reply: any) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { season, startWeek, endWeek, clearExisting } = request.body;

      // Validate inputs
      if (!season || typeof season !== "number") {
        return reply.code(400).send({
          error: "Invalid season",
          message: "season must be a number",
        });
      }

      const currentYear = new Date().getFullYear();
      if (season < 2017 || season > currentYear) {
        return reply.code(400).send({
          error: "Invalid season",
          message: `season must be between 2017 and ${currentYear}`,
        });
      }

      const start = startWeek ?? 1;
      const end = endWeek ?? 28;

      if (start < 1 || end > 30 || start > end) {
        return reply.code(400).send({
          error: "Invalid week range",
          message:
            "startWeek must be >= 1, endWeek must be <= 30, and startWeek <= endWeek",
        });
      }

      // Look up league
      const league = await db
        .selectFrom("league")
        .select([
          "id",
          "espn_league_id",
          "espn_swid_encrypted",
          "espn_s2_encrypted",
          "name",
        ])
        .where("id", "=", leagueId)
        .executeTakeFirst();

      if (!league) {
        return reply.code(404).send({
          error: "League not found",
        });
      }

      // ESPN auth: env vars first, then encrypted DB fallback
      let espnAuth: { SWID?: string; espn_s2?: string } | undefined = getEspnAuthFromEnv();
      if (!espnAuth && league.espn_swid_encrypted && league.espn_s2_encrypted) {
        if (!hasEncryptionKey()) {
          return reply.code(500).send({ error: "ENCRYPTION_KEY not configured - cannot decrypt credentials" });
        }
        try {
          espnAuth = {
            SWID: decryptToken(league.espn_swid_encrypted),
            espn_s2: decryptToken(league.espn_s2_encrypted),
          };
        } catch (error) {
          request.log.error({ error }, "Failed to decrypt ESPN cookies");
          return reply.code(500).send({ error: "Failed to decrypt ESPN credentials" });
        }
      }

      // Clear existing data if requested
      if (clearExisting) {
        const baseDate = new Date(season, 3, 1);
        const startDate = new Date(
          baseDate.getTime() + (start - 1) * 7 * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split("T")[0];
        const endDate = new Date(
          baseDate.getTime() + (end - 1) * 7 * 24 * 60 * 60 * 1000,
        )
          .toISOString()
          .split("T")[0];

        request.log.info(
          { leagueId, season, startDate, endDate },
          "Clearing existing backfill data before re-trigger",
        );

        await db
          .deleteFrom("league_daily_snapshot")
          .where("league_id", "=", leagueId)
          .where("snapshot_date", ">=", startDate)
          .where("snapshot_date", "<=", endDate)
          .execute();

        await db
          .deleteFrom("league_raw_payload")
          .where("league_id", "=", leagueId)
          .where("scoring_period_id", ">=", start)
          .where("scoring_period_id", "<=", end)
          .execute();

        await db
          .deleteFrom("league_transaction_event")
          .where("league_id", "=", leagueId)
          .where("event_date", ">=", startDate)
          .where("event_date", "<=", endDate)
          .execute();
      }

      // Construct jobId for deduplication
      const jobId = `backfill-${leagueId}-${season}`;

      try {
        // Remove existing completed/failed job so we can re-queue with the same ID.
        // BullMQ deduplicates by jobId — a completed job kept by removeOnComplete
        // blocks re-adds until it expires.
        const existingJob = await backfillQueue.getJob(jobId);
        if (existingJob) {
          const state = await existingJob.getState();
          if (state === "completed" || state === "failed") {
            await existingJob.remove();
          }
        }

        // Add job to queue
        const job = await backfillQueue.add(
          jobId,
          {
            leagueId,
            season,
            startWeek: start,
            endWeek: end,
            espnAuth,
          },
          {
            jobId,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 10000,
            },
            removeOnComplete: {
              age: 86400, // Keep for 24 hours
            },
            removeOnFail: {
              age: 86400,
            },
          },
        );

        if (!job) {
          return reply.code(409).send({
            success: false,
            error: "Backfill already in progress for this league/season",
          });
        }

        request.log.info(
          { leagueId, season, start, end, jobId },
          "Backfill job started",
        );

        return {
          success: true,
          jobId,
          message: `Backfill started: ${end - start + 1} weeks`,
        };
      } catch (error) {
        request.log.error(
          { error, leagueId, season },
          "Failed to start backfill",
        );
        return reply.code(500).send({
          success: false,
          error: "Failed to start backfill job",
        });
      }
    },
  );

  // DELETE /api/admin/leagues/:leagueId/backfill - Clear existing backfill data
  app.delete(
    "/api/admin/leagues/:leagueId/backfill",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request: any, reply: any) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const season = parseInt(request.query.season, 10);
      const startWeek = parseInt(request.query.startWeek || "1", 10);
      const endWeek = parseInt(request.query.endWeek || "28", 10);

      if (!season || isNaN(season)) {
        return reply.code(400).send({
          error: "Invalid season",
          message: "season query parameter is required",
        });
      }

      // Compute snapshot date range using same formula as historical-backfill.ts
      const baseDate = new Date(season, 3, 1); // April 1 of season year
      const startDate = new Date(
        baseDate.getTime() + (startWeek - 1) * 7 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split("T")[0];
      const endDate = new Date(
        baseDate.getTime() + (endWeek - 1) * 7 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split("T")[0];

      request.log.info(
        { leagueId, season, startWeek, endWeek, startDate, endDate },
        "Clearing backfill data",
      );

      try {
        // Delete league_daily_snapshot rows in the date range
        // All child tables (category_totals, category_ranks, overall, roster_snapshot)
        // are cascade-deleted via ON DELETE CASCADE foreign keys
        const snapshotResult = await db
          .deleteFrom("league_daily_snapshot")
          .where("league_id", "=", leagueId)
          .where("snapshot_date", ">=", startDate)
          .where("snapshot_date", "<=", endDate)
          .executeTakeFirst();

        const snapshotsDeleted = Number(snapshotResult.numDeletedRows);

        // Delete raw payloads for the historical scoring periods
        const rawResult = await db
          .deleteFrom("league_raw_payload")
          .where("league_id", "=", leagueId)
          .where("scoring_period_id", ">=", startWeek)
          .where("scoring_period_id", "<=", endWeek)
          .executeTakeFirst();

        const rawPayloadsDeleted = Number(rawResult.numDeletedRows);

        // Delete transaction events in the date range
        const txnResult = await db
          .deleteFrom("league_transaction_event")
          .where("league_id", "=", leagueId)
          .where("event_date", ">=", startDate)
          .where("event_date", "<=", endDate)
          .executeTakeFirst();

        const transactionsDeleted = Number(txnResult.numDeletedRows);

        request.log.info(
          {
            leagueId,
            season,
            snapshotsDeleted,
            rawPayloadsDeleted,
            transactionsDeleted,
          },
          "Backfill data cleared",
        );

        return {
          success: true,
          deleted: {
            snapshots: snapshotsDeleted,
            rawPayloads: rawPayloadsDeleted,
            transactions: transactionsDeleted,
          },
          dateRange: { startDate, endDate },
        };
      } catch (error) {
        request.log.error(
          { error, leagueId, season },
          "Failed to clear backfill data",
        );
        return reply.code(500).send({
          success: false,
          error: "Failed to clear backfill data",
        });
      }
    },
  );

  // GET /api/admin/backfill-jobs/:jobId - Get backfill job status
  app.get(
    "/api/admin/backfill-jobs/:jobId",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request: any, reply: any) => {
      const jobId = request.params.jobId;

      const job = await backfillQueue.getJob(jobId);

      if (!job) {
        return reply.code(404).send({
          error: "Job not found",
        });
      }

      const state = await job.getState();
      const progress = job.progress || { percentage: 0, stage: "pending" };

      return {
        id: job.id,
        status: state,
        progress,
        data: {
          leagueId: job.data.leagueId,
          season: job.data.season,
          startWeek: job.data.startWeek,
          endWeek: job.data.endWeek,
        },
        createdAt: job.timestamp,
        finishedAt: job.finishedOn,
        failedReason: job.failedReason,
        returnValue: job.returnvalue,
      };
    },
  );

  // GET /api/admin/backfill-jobs - List recent backfill jobs
  app.get(
    "/api/admin/backfill-jobs",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async () => {
      // Get recent jobs from backfillQueue
      const [active, waiting, completed, failed] = await Promise.all([
        backfillQueue.getJobs(["active"], 0, 10),
        backfillQueue.getJobs(["waiting"], 0, 10),
        backfillQueue.getJobs(["completed"], 0, 10),
        backfillQueue.getJobs(["failed"], 0, 10),
      ]);

      // Map jobs to response format
      const mapJob = async (job: any) => {
        const state = await job.getState();
        return {
          id: job.id,
          status: state,
          progress: job.progress || { percentage: 0, stage: "pending" },
          data: {
            leagueId: job.data.leagueId,
            season: job.data.season,
            startWeek: job.data.startWeek,
            endWeek: job.data.endWeek,
          },
          createdAt: job.timestamp,
          finishedAt: job.finishedOn,
          failedReason: job.failedReason,
        };
      };

      const allJobs = await Promise.all([
        ...active.map(mapJob),
        ...waiting.map(mapJob),
        ...completed.map(mapJob),
        ...failed.map(mapJob),
      ]);

      // Sort by createdAt desc
      allJobs.sort((a, b) => b.createdAt - a.createdAt);

      return {
        jobs: allJobs,
      };
    },
  );

  // POST /api/admin/player-pool/sync - Manually trigger player pool sync
  app.post(
    "/api/admin/player-pool/sync",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour",
        },
      },
    },
    async (request: any, reply: any) => {
      const season = parseInt(
        request.body.season || new Date().getFullYear(),
        10,
      );

      if (season < 2017 || season > new Date().getFullYear() + 1) {
        return reply.code(400).send({
          error: "Invalid season",
          message: `season must be between 2017 and ${new Date().getFullYear() + 1}`,
        });
      }

      try {
        // Import player pool queue dynamically
        const { playerPoolQueue } =
          await import("../workers/player-pool-worker.js");

        // Add job to queue
        const jobId = `manual-sync-${season}-${Date.now()}`;
        await playerPoolQueue.add(
          jobId,
          { season },
          {
            jobId,
            removeOnComplete: {
              age: 86400, // Keep for 24 hours
            },
            removeOnFail: {
              age: 86400 * 7, // Keep failures for 7 days
            },
          },
        );

        request.log.info({ season, jobId }, "Player pool sync job enqueued");

        return {
          success: true,
          jobId,
          season,
          message: "Player pool sync started",
        };
      } catch (error) {
        request.log.error(
          { error, season },
          "Failed to trigger player pool sync",
        );
        return reply.code(500).send({
          success: false,
          error: "Failed to trigger player pool sync",
        });
      }
    },
  );

  // PUT /api/admin/seasons/:leagueId/:season/finalize - Set or reset season finalization
  app.put(
    "/api/admin/seasons/:leagueId/:season/finalize",
    { onRequest: [requireAdmin] },
    async (request: any, reply: any) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const season = parseInt(request.params.season, 10);
      const { finalized } = request.body as { finalized: boolean };

      if (isNaN(leagueId) || isNaN(season)) {
        return reply.status(400).send({ error: "Invalid leagueId or season" });
      }

      if (typeof finalized !== "boolean") {
        return reply.status(400).send({ error: "Body must include { finalized: boolean }" });
      }

      await db
        .insertInto("season_metadata")
        .values({
          league_id: leagueId,
          season,
          is_finalized: finalized,
          finalized_at: finalized ? new Date() : null,
          snapshot_count: null,
        })
        .onConflict((oc) =>
          oc.columns(["league_id", "season"]).doUpdateSet({
            is_finalized: finalized,
            finalized_at: finalized ? new Date() : null,
          }),
        )
        .execute();

      return {
        league_id: leagueId,
        season,
        is_finalized: finalized,
        message: finalized
          ? "Season finalized — projection recomputation will be skipped"
          : "Season un-finalized — projection recomputation will resume",
      };
    },
  );

  // GET /api/admin/seasons/:leagueId - List season metadata for a league
  app.get(
    "/api/admin/seasons/:leagueId",
    { onRequest: [requireAdmin] },
    async (request: any, reply: any) => {
      const leagueId = parseInt(request.params.leagueId, 10);

      if (isNaN(leagueId)) {
        return reply.status(400).send({ error: "Invalid leagueId" });
      }

      const seasons = await db
        .selectFrom("season_metadata")
        .selectAll()
        .where("league_id", "=", leagueId)
        .orderBy("season", "desc")
        .execute();

      return { seasons };
    },
  );

  // GET /api/admin/leagues/:leagueId/debug/period-stats - Debug endpoint for scoring period roster stats
  app.get(
    "/api/admin/leagues/:leagueId/debug/period-stats",
    {
      onRequest: [requireAdmin],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute",
        },
      },
    },
    async (request: any, reply: any) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const season = parseInt(request.query.season, 10);
      const scoringPeriodId = parseInt(request.query.scoringPeriodId, 10);

      // Validate inputs
      if (!season || isNaN(season)) {
        return reply.code(400).send({
          error: "Invalid season",
          message: "season query parameter is required",
        });
      }

      if (!scoringPeriodId || isNaN(scoringPeriodId)) {
        return reply.code(400).send({
          error: "Invalid scoringPeriodId",
          message: "scoringPeriodId query parameter is required",
        });
      }

      // Look up league
      const league = await db
        .selectFrom("league")
        .select([
          "id",
          "espn_league_id",
          "espn_swid_encrypted",
          "espn_s2_encrypted",
          "name",
        ])
        .where("id", "=", leagueId)
        .executeTakeFirst();

      if (!league) {
        return reply.code(404).send({
          error: "League not found",
        });
      }

      // ESPN auth: env vars first, then encrypted DB fallback
      let espnAuth: ESPNAuthCookies | undefined = getEspnAuthFromEnv();
      if (!espnAuth && league.espn_swid_encrypted && league.espn_s2_encrypted) {
        if (!hasEncryptionKey()) {
          return reply.code(500).send({ error: "ENCRYPTION_KEY not configured - cannot decrypt credentials" });
        }
        try {
          espnAuth = {
            SWID: decryptToken(league.espn_swid_encrypted),
            espn_s2: decryptToken(league.espn_s2_encrypted),
          };
        } catch (error) {
          request.log.error({ error }, "Failed to decrypt ESPN cookies");
          return reply.code(500).send({ error: "Failed to decrypt ESPN credentials" });
        }
      }

      try {
        // Create ESPNAdapter instance with request logger
        const espnAdapter = new ESPNAdapter(request.log);

        // Fetch historical week data
        const espnData = await espnAdapter.fetchHistoricalWeek({
          leagueId: league.espn_league_id,
          season,
          scoringPeriodId,
          auth: espnAuth,
        });

        const rawTeams = (espnData.data as any).teams || [];
        const teams = [];

        for (const team of rawTeams) {
          const rosterEntries = team.roster?.entries || [];
          const players = [];
          const teamPeriodTotals: Record<string, number> = {};

          for (const entry of rosterEntries) {
            const playerId = entry.playerId;
            const playerName =
              entry.playerPoolEntry?.player?.fullName || "Unknown";
            const lineupSlotId = entry.lineupSlotId;
            const slotLabel =
              ESPN_LINEUP_SLOT_MAP[lineupSlotId] || `Slot ${lineupSlotId}`;

            // Check if player would be included by the fixed filter
            const included = lineupSlotId !== undefined && lineupSlotId <= 16;

            // Find per-period stats (statSplitTypeId=5)
            const playerStats = entry.playerPoolEntry?.player?.stats || [];
            const periodStats = playerStats.find(
              (s: any) =>
                s.scoringPeriodId === scoringPeriodId &&
                s.statSplitTypeId === 5,
            );

            const periodStatsObj: Record<string, number> = {};

            if (periodStats && periodStats.stats) {
              for (const [espnStatIdStr, value] of Object.entries(
                periodStats.stats,
              )) {
                const espnStatId = parseInt(espnStatIdStr, 10);
                const statInfo = ESPN_STAT_MAP[espnStatId];

                if (statInfo && typeof value === "number") {
                  periodStatsObj[statInfo.key] = value;

                  // Accumulate to team totals if included
                  if (included && statInfo.type === "COUNTING") {
                    if (statInfo.key === "OUTS") {
                      const ip = value / 3;
                      teamPeriodTotals.IP = (teamPeriodTotals.IP || 0) + ip;
                    } else {
                      teamPeriodTotals[statInfo.key] =
                        (teamPeriodTotals[statInfo.key] || 0) + value;
                    }
                  }
                }
              }
            }

            players.push({
              playerId,
              name: playerName,
              lineupSlotId,
              slotLabel,
              included,
              periodStats: periodStatsObj,
            });
          }

          // Get ESPN's team-level valuesByStat for comparison
          const valuesByStat: Record<string, number> = {};
          if (team.valuesByStat) {
            for (const [espnStatIdStr, value] of Object.entries(
              team.valuesByStat,
            )) {
              const espnStatId = parseInt(espnStatIdStr, 10);
              const statInfo = ESPN_STAT_MAP[espnStatId];
              if (statInfo && typeof value === "number") {
                valuesByStat[statInfo.key] = value;
              }
            }
          }

          teams.push({
            teamId: team.id,
            teamName: team.name || `Team ${team.id}`,
            valuesByStat,
            rosterPlayerCount: rosterEntries.length,
            playersWithPeriodStats: players.filter(
              (p) => Object.keys(p.periodStats).length > 0,
            ).length,
            players,
            teamPeriodTotals,
          });
        }

        return {
          scoringPeriodId,
          season,
          teams,
        };
      } catch (error) {
        request.log.error(
          { error, leagueId, season, scoringPeriodId },
          "Failed to fetch period stats",
        );
        return reply.code(500).send({
          success: false,
          error: "Failed to fetch period stats from ESPN",
        });
      }
    },
  );
}
