import { timingSafeEqual } from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/connection.js";

/**
 * Internal API endpoints for job scheduling and system operations
 * Requires Authorization: Bearer $INTERNAL_JOB_TOKEN
 */

/**
 * Verify internal job token (C3)
 * Outside development, INTERNAL_JOB_TOKEN is required — startup fails if absent.
 * In development, the token is optional; when set it is still enforced.
 */
if (process.env.NODE_ENV !== "development" && !process.env.INTERNAL_JOB_TOKEN) {
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
  if (!authHeader) {
    request.log.warn({ hasAuth: false }, "Unauthorized internal API request");
    return reply.code(401).send({ error: "Unauthorized" });
  }
  const expected = `Bearer ${INTERNAL_JOB_TOKEN}`;
  const providedBuf = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expected);
  const valid =
    providedBuf.length === expectedBuf.length &&
    timingSafeEqual(providedBuf, expectedBuf);
  if (!valid) {
    request.log.warn({ hasAuth: true }, "Unauthorized internal API request");
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

export async function internalRoutes(app: FastifyInstance) {
  const db = getDb();

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
