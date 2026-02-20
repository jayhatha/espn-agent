import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/connection.js";
import { DraftRankingsAgent } from "../agents/draft-rankings.js";
import { AuctionValuationAgent } from "../agents/auction-valuation.js";
import { authenticate, requireLeagueAccess } from "../middleware/auth.js";

/**
 * Draft API Routes
 * Pre-draft rankings and auction valuations
 */

export async function draftRoutes(app: FastifyInstance) {
  const db = getDb();

  // GET /api/leagues/:leagueId/draft/rankings - Pre-draft VBD rankings
  app.get(
    "/api/leagues/:leagueId/draft/rankings",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (
      request: FastifyRequest<{
        Params: { leagueId: string };
        Querystring: {
          position?: string;
          limit?: string;
          projectionsRunId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { position, limit, projectionsRunId } = request.query;
      const maxPlayers = limit ? parseInt(limit, 10) : 300;

      try {
        // Get league info
        const league = await db
          .selectFrom("league")
          .select(["id", "name"])
          .where("id", "=", leagueId)
          .executeTakeFirst();

        if (!league) {
          return reply.code(404).send({ error: "League not found" });
        }

        // Count teams in league
        const teamsResult = await db
          .selectFrom("team")
          .select(({ fn }) => [fn.countAll<number>().as("count")])
          .where("league_id", "=", leagueId)
          .executeTakeFirst();

        const totalTeams = teamsResult?.count || 0;

        if (totalTeams === 0) {
          return reply.code(404).send({
            error: "No teams found in league. Please sync league data first.",
          });
        }

        // Instantiate agent
        const draftAgent = new DraftRankingsAgent(db, request.log as any);

        // Get rankings
        const rankings = await draftAgent.getRankings(leagueId, {
          projectionsRunId: projectionsRunId
            ? parseInt(projectionsRunId, 10)
            : undefined,
          limit: maxPlayers,
          position: position || undefined,
        });

        return {
          rankings,
          meta: {
            leagueId,
            leagueName: league.name,
            totalTeams,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        request.log.error({ error }, "Failed to generate draft rankings");
        return reply.code(500).send({
          error: "Failed to generate draft rankings",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // GET /api/leagues/:leagueId/draft/auction - Auction dollar valuations
  app.get(
    "/api/leagues/:leagueId/draft/auction",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (
      request: FastifyRequest<{
        Params: { leagueId: string };
        Querystring: {
          position?: string;
          limit?: string;
          budget?: string;
          minBid?: string;
          projectionsRunId?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { position, limit, budget, minBid, projectionsRunId } =
        request.query;
      const maxPlayers = limit ? parseInt(limit, 10) : 300;
      const auctionBudget = budget ? parseInt(budget, 10) : 260;
      const minimumBid = minBid ? parseInt(minBid, 10) : 1;

      // Validate params
      if (auctionBudget < 100 || auctionBudget > 1000) {
        return reply
          .code(400)
          .send({ error: "Budget must be between 100 and 1000" });
      }

      if (minimumBid < 1 || minimumBid > 10) {
        return reply
          .code(400)
          .send({ error: "Minimum bid must be between 1 and 10" });
      }

      try {
        // Get league info
        const league = await db
          .selectFrom("league")
          .select(["id", "name"])
          .where("id", "=", leagueId)
          .executeTakeFirst();

        if (!league) {
          return reply.code(404).send({ error: "League not found" });
        }

        // Count teams in league
        const teamsResult = await db
          .selectFrom("team")
          .select(({ fn }) => [fn.countAll<number>().as("count")])
          .where("league_id", "=", leagueId)
          .executeTakeFirst();

        const totalTeams = teamsResult?.count || 0;

        if (totalTeams === 0) {
          return reply.code(404).send({
            error: "No teams found in league. Please sync league data first.",
          });
        }

        // Instantiate agents
        const draftAgent = new DraftRankingsAgent(db, request.log as any);
        const auctionAgent = new AuctionValuationAgent(
          db,
          draftAgent,
          request.log as any,
        );

        // Get valuations
        const valuations = await auctionAgent.getValuations(leagueId, {
          projectionsRunId: projectionsRunId
            ? parseInt(projectionsRunId, 10)
            : undefined,
          budget: auctionBudget,
          minBid: minimumBid,
          limit: maxPlayers,
          position: position || undefined,
        });

        return {
          valuations,
          meta: {
            leagueId,
            leagueName: league.name,
            totalTeams,
            budget: auctionBudget,
            minBid: minimumBid,
            playersAboveReplacement: valuations.filter((v) => v.dollarValue > minimumBid).length,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        request.log.error({ error }, "Failed to generate auction valuations");
        return reply.code(500).send({
          error: "Failed to generate auction valuations",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}
