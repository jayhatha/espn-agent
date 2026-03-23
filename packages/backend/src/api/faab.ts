import type { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { FaabTrackerAgent } from "../agents/faab-tracker.js";
import { authenticate, requireLeagueAccess, requireTeamOwnership } from "../middleware/auth.js";

/**
 * FAAB Tracking API Routes
 *
 * Budget summary, bid history, and suggested bid endpoints.
 */

export async function faabRoutes(app: FastifyInstance) {
  const db = getDb();

  // Get FAAB budget summary for a team
  app.get<{
    Params: { leagueId: string; teamId: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/faab",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      try {
        const agent = new FaabTrackerAgent(db, request.log as any);
        const summary = await agent.getSummary(leagueId, teamId);
        return summary;
      } catch (error) {
        request.log.error({ error, leagueId, teamId }, "Failed to get FAAB summary");
        return reply.code(500).send({ error: "Failed to compute FAAB summary" });
      }
    },
  );

  // Get bid history for a team
  app.get<{
    Params: { leagueId: string; teamId: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/faab/history",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      try {
        const agent = new FaabTrackerAgent(db, request.log as any);
        const history = await agent.getBidHistory(leagueId, teamId);
        return { bids: history };
      } catch (error) {
        request.log.error({ error, leagueId, teamId }, "Failed to get bid history");
        return reply.code(500).send({ error: "Failed to fetch bid history" });
      }
    },
  );

  // Get suggested bid for a player
  app.get<{
    Params: { leagueId: string; teamId: string; playerId: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/faab/suggested-bid/:playerId",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const playerId = parseInt(request.params.playerId, 10);

      try {
        const agent = new FaabTrackerAgent(db, request.log as any);
        const suggestion = await agent.getSuggestedBid(leagueId, teamId, playerId);
        return suggestion;
      } catch (error) {
        request.log.error({ error, leagueId, teamId, playerId }, "Failed to get suggested bid");
        return reply.code(500).send({ error: "Failed to compute suggested bid" });
      }
    },
  );
}
