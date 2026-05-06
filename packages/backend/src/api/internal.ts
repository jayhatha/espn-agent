import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/connection.js";
import { isSlackEnabled } from "../utils/feature-flags.js";

/**
 * Internal API endpoints for job scheduling and system operations
 * Requires Authorization: Bearer $INTERNAL_JOB_TOKEN
 */

/**
 * Verify internal job token (C3)
 * Outside development, INTERNAL_JOB_TOKEN is required — startup fails if absent.
 * In development, the token is optional; when set it is still enforced.
 */
if (
  process.env.NODE_ENV !== "development" &&
  !process.env.INTERNAL_JOB_TOKEN
) {
  throw new Error(
    "INTERNAL_JOB_TOKEN environment variable is required outside development mode",
  );
}

async function verifyInternalToken(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const INTERNAL_JOB_TOKEN = process.env.INTERNAL_JOB_TOKEN;

  if (!INTERNAL_JOB_TOKEN) {
    // Development only (guaranteed by startup check above)
    request.log.warn(
      "INTERNAL_JOB_TOKEN not set — internal API unauthenticated (development only)",
    );
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${INTERNAL_JOB_TOKEN}`) {
    request.log.warn(
      { hasAuth: !!authHeader },
      "Unauthorized internal API request",
    );
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

export async function internalRoutes(app: FastifyInstance) {
  const db = getDb();

  /**
   * POST /internal/jobs/morning-report
   * Trigger morning report generation for all enabled targets
   *
   * Body: { date?: "YYYY-MM-DD" } (defaults to today)
   */
  app.post<{ Body: { date?: string } }>(
    "/internal/jobs/morning-report",
    {
      preHandler: verifyInternalToken,
    },
    async (request, reply) => {
      const { date } = request.body || {};
      const reportDate = date || new Date().toISOString().split("T")[0];

      // Check if Slack is enabled
      if (!isSlackEnabled()) {
        request.log.warn("Morning report requested but Slack is disabled");
        return reply.code(503).send({
          success: false,
          error: "Slack integration is disabled",
          message:
            "Morning reports require Slack integration. Set FEATURE_SLACK_ENABLED=true to enable.",
        });
      }

      request.log.info({ reportDate }, "Triggering morning report jobs");

      try {
        // Find all enabled notification targets
        const targets = await db
          .selectFrom("slack_notification_target")
          .selectAll()
          .where("is_enabled", "=", true)
          .execute();

        request.log.info(
          { targetCount: targets.length },
          "Found enabled notification targets",
        );

        if (targets.length === 0) {
          return reply.send({
            success: true,
            message: "No enabled notification targets found",
            jobsEnqueued: 0,
            reportDate,
          });
        }

        // Import queue dynamically (avoids circular deps)
        const { morningReportQueue } =
          await import("../workers/morning-report-worker.js");

        // Enqueue job for each target
        const jobPromises = targets.map((target) =>
          morningReportQueue.add(
            `report-${target.slack_user_link_id}-${reportDate}`,
            {
              slackUserLinkId: target.slack_user_link_id,
              leagueId: target.league_id,
              reportDate,
            },
            {
              jobId: `report-${target.slack_user_link_id}-${reportDate}`,
              removeOnComplete: {
                age: 86400, // Keep completed jobs for 24 hours
                count: 100,
              },
              removeOnFail: {
                age: 604800, // Keep failed jobs for 7 days
                count: 1000,
              },
            },
          ),
        );

        await Promise.all(jobPromises);

        request.log.info(
          { jobsEnqueued: targets.length, reportDate },
          "Morning report jobs enqueued",
        );

        return reply.send({
          success: true,
          message: "Morning report jobs enqueued successfully",
          jobsEnqueued: targets.length,
          reportDate,
          targets: targets.map((t) => ({
            slackUserLinkId: t.slack_user_link_id,
            leagueId: t.league_id,
            targetType: t.target_type,
          })),
        });
      } catch (error) {
        request.log.error({ error }, "Failed to enqueue morning report jobs");
        return reply.code(500).send({
          success: false,
          error: "Failed to enqueue jobs",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );

  /**
   * GET /internal/health
   * Health check endpoint for internal monitoring
   */
  app.get(
    "/internal/health",
    {
      preHandler: verifyInternalToken,
    },
    async (request, reply) => {
      // Check database connectivity
      try {
        await db
          .selectFrom("league")
          .select((eb) => eb.fn.countAll().as("count"))
          .executeTakeFirst();

        return reply.send({
          status: "healthy",
          timestamp: new Date().toISOString(),
          checks: {
            database: "ok",
          },
        });
      } catch (error) {
        request.log.error({ error }, "Health check failed");
        return reply.code(503).send({
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          checks: {
            database: "error",
          },
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
  );
}
