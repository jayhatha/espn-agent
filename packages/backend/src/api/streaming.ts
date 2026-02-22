import type { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { StreamingPitcherAgent } from "../agents/streaming-pitcher.js";
import { MLBStatsAPIAdapter } from "../adapters/mlb-statsapi.js";
import { authenticate, requireLeagueAccess } from "../middleware/auth.js";

/**
 * Streaming Pitcher Recommendations API Routes
 */

export async function streamingRoutes(app: FastifyInstance) {
  const db = getDb();

  // Get streaming pitcher recommendations
  app.get<{
    Params: { leagueId: string };
    Querystring: {
      teamId?: string;
      startDate?: string;
      lookAheadDays?: string;
      limit?: string;
    };
  }>(
    "/api/leagues/:leagueId/streaming-pitchers",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamIdStr = request.query.teamId;
      const teamId = teamIdStr ? parseInt(teamIdStr, 10) : 0;
      const startDate = request.query.startDate || new Date().toISOString().split("T")[0];
      const lookAheadDays = request.query.lookAheadDays
        ? parseInt(request.query.lookAheadDays, 10)
        : 7;
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 20;

      // Verify league exists
      const league = await db
        .selectFrom("league")
        .select("id")
        .where("id", "=", leagueId)
        .executeTakeFirst();

      if (!league) {
        return reply.code(404).send({ error: "League not found" });
      }

      try {
        // Instantiate adapter and agent
        const mlbAdapter = new MLBStatsAPIAdapter(request.log as any);
        const streamingAgent = new StreamingPitcherAgent(db, mlbAdapter, request.log as any);

        // Get recommendations
        const result = await streamingAgent.getRecommendations(leagueId, teamId, {
          startDate,
          lookAheadDays,
          limit,
        });

        return {
          candidates: result.candidates,
          dateRange: result.dateRange,
          totalCandidates: result.candidates.length,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        request.log.error({ error }, "Failed to generate streaming pitcher recommendations");
        return reply.code(500).send({
          error: "Failed to generate streaming pitcher recommendations",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}
