import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/connection.js";
import { LineupOptimizerAgent } from "../agents/lineup-optimizer.js";
import { MLBStatsAPIAdapter } from "../adapters/mlb-statsapi.js";
import { authenticate, requireLeagueAccess, requireTeamOwnership } from "../middleware/auth.js";

/**
 * Lineup Optimization API Routes
 */

export async function lineupRoutes(app: FastifyInstance) {
  const db = getDb();

  // Get lineup optimization recommendations
  app.get(
    "/api/leagues/:leagueId/teams/:teamId/lineup/recommendations",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
        Querystring: { snapshotDate?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const { snapshotDate } = request.query;

      // Get latest snapshot date if not provided
      let date = snapshotDate;
      if (!date) {
        const latest = await db
          .selectFrom("league_daily_snapshot")
          .select("snapshot_date")
          .where("league_id", "=", leagueId)
          .orderBy("snapshot_date", "desc")
          .executeTakeFirst();

        if (!latest) {
          return reply
            .code(404)
            .send({ error: "No snapshots found for league" });
        }
        date = latest.snapshot_date;
      }

      try {
        // Instantiate adapter and agent
        const mlbAdapter = new MLBStatsAPIAdapter(request.log as any);
        const lineupAgent = new LineupOptimizerAgent(db, mlbAdapter, request.log as any);

        // Get recommendations
        const result = await lineupAgent.getRecommendations(leagueId, teamId, date);

        return {
          recommendations: result.recommendations,
          totalProjectedGain: result.totalProjectedGain,
          snapshotDate: date,
          isOptimal: result.isOptimal,
          generatedAt: new Date().toISOString(),
        };
      } catch (error) {
        request.log.error({ error }, "Failed to generate lineup recommendations");
        return reply.code(500).send({
          error: "Failed to generate lineup recommendations",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}
