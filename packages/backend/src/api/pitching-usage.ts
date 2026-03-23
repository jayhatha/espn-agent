import type { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { GsPacingAgent } from "../agents/gs-pacing.js";
import { authenticate, requireLeagueAccess, requireTeamOwnership } from "../middleware/auth.js";

/**
 * Pitching Usage API Routes
 *
 * GS pacing summary, weekly breakdown, and SP start/sit planner.
 */

export async function pitchingUsageRoutes(app: FastifyInstance) {
  const db = getDb();

  // Get season GS pacing summary
  app.get<{
    Params: { leagueId: string; teamId: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/pitching/gs",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      try {
        const agent = new GsPacingAgent(db, request.log as any);
        const summary = await agent.getSeasonSummary(leagueId, teamId);
        return summary;
      } catch (error) {
        request.log.error({ error, leagueId, teamId }, "Failed to get GS summary");
        return reply.code(500).send({ error: "Failed to compute GS pacing summary" });
      }
    },
  );

  // Get weekly GS breakdown
  app.get<{
    Params: { leagueId: string; teamId: string };
    Querystring: { weekStart?: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/pitching/gs/weekly",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const weekStart = request.query.weekStart;

      try {
        const agent = new GsPacingAgent(db, request.log as any);
        const weekly = await agent.getWeeklySummary(leagueId, teamId, weekStart);
        return weekly;
      } catch (error) {
        request.log.error({ error, leagueId, teamId }, "Failed to get weekly GS");
        return reply.code(500).send({ error: "Failed to compute weekly GS breakdown" });
      }
    },
  );

  // Get SP start/sit recommendations
  app.get<{
    Params: { leagueId: string; teamId: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/pitching/start-plan",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      try {
        const agent = new GsPacingAgent(db, request.log as any);
        const plan = await agent.getStartPlan(leagueId, teamId);
        return plan;
      } catch (error) {
        request.log.error({ error, leagueId, teamId }, "Failed to get start plan");
        return reply.code(500).send({ error: "Failed to generate SP start plan" });
      }
    },
  );
}
