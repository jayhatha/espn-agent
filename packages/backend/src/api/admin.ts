import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { getDb } from "../db/connection.js";
import { requireAdmin } from "../middleware/auth.js";
import { backfillQueue } from "../workers/backfill-worker.js";
import { decryptToken, hasEncryptionKey } from "../utils/encryption.js";

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
          sql<number>`COUNT(*) FILTER (WHERE is_degraded = false)`.as("healthy"),
          sql<number>`COUNT(*) FILTER (WHERE is_degraded = true)`.as("degraded"),
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
        .leftJoin(
          "league_daily_snapshot",
          (join) =>
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
      const { season, startWeek, endWeek } = request.body;

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
      const end = endWeek ?? 26;

      if (start < 1 || end > 26 || start > end) {
        return reply.code(400).send({
          error: "Invalid week range",
          message: "startWeek must be >= 1, endWeek must be <= 26, and startWeek <= endWeek",
        });
      }

      // Look up league
      const league = await db
        .selectFrom("league")
        .select([
          "id",
          "espn_league_id",
          "espn_swid",
          "espn_s2",
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

      // Get ESPN auth credentials (prefer encrypted, fall back to plaintext)
      let espnAuth: { SWID?: string; espn_s2?: string } | undefined;
      const swidSource = league.espn_swid_encrypted || league.espn_swid;
      const s2Source = league.espn_s2_encrypted || league.espn_s2;

      if (swidSource || s2Source) {
        const SWID = swidSource
          ? Buffer.isBuffer(swidSource) && hasEncryptionKey()
            ? decryptToken(swidSource)
            : Buffer.isBuffer(swidSource)
              ? swidSource.toString()
              : swidSource
          : undefined;
        const espn_s2 = s2Source
          ? Buffer.isBuffer(s2Source) && hasEncryptionKey()
            ? decryptToken(s2Source)
            : Buffer.isBuffer(s2Source)
              ? s2Source.toString()
              : s2Source
          : undefined;
        espnAuth = { SWID, espn_s2 };
      }

      // Construct jobId for deduplication
      const jobId = `backfill-${leagueId}-${season}`;

      try {
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
        request.log.error({ error, leagueId, season }, "Failed to start backfill");
        return reply.code(500).send({
          success: false,
          error: "Failed to start backfill job",
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
}
