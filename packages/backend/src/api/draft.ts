import type { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { DraftRankingsAgent } from "../agents/draft-rankings.js";
import { AuctionValuationAgent } from "../agents/auction-valuation.js";
import { authenticate, requireLeagueAccess } from "../middleware/auth.js";
import type {
  DraftConfiguration,
  Category,
} from "../../../shared/dist/index.js";

/**
 * Draft API Routes
 * Pre-draft rankings and auction valuations
 */

/**
 * Validate draft configuration from query parameters
 */
function validateDraftConfig(params: any): {
  valid: boolean;
  config?: DraftConfiguration;
  error?: string;
} {
  // Validate numTeams
  const numTeams = parseInt(params.numTeams, 10);
  if (!numTeams || numTeams < 2 || numTeams > 30) {
    return { valid: false, error: "numTeams must be between 2 and 30" };
  }

  // Parse and validate categories
  let categories: Category[];
  try {
    categories = JSON.parse(params.categories);
    if (!Array.isArray(categories) || categories.length === 0) {
      return { valid: false, error: "categories must be a non-empty array" };
    }
    for (const cat of categories) {
      if (!cat.category_id || !cat.stat_key || !cat.type || !cat.direction) {
        return { valid: false, error: "Invalid category format" };
      }
    }
  } catch {
    return { valid: false, error: "categories must be valid JSON" };
  }

  // Parse and validate rosterSlots
  let rosterSlots: Record<string, number>;
  try {
    rosterSlots = JSON.parse(params.rosterSlots);
    if (
      typeof rosterSlots !== "object" ||
      Object.keys(rosterSlots).length === 0
    ) {
      return { valid: false, error: "rosterSlots must be a non-empty object" };
    }
    for (const [pos, count] of Object.entries(rosterSlots)) {
      if (typeof count !== "number" || count < 0 || !Number.isInteger(count)) {
        return { valid: false, error: `Invalid roster slot count for ${pos}` };
      }
    }
  } catch {
    return { valid: false, error: "rosterSlots must be valid JSON" };
  }

  return {
    valid: true,
    config: {
      categories,
      rosterSlots,
      totalTeams: numTeams,
    },
  };
}

export async function draftRoutes(app: FastifyInstance) {
  const db = getDb();

  // GET /api/leagues/:leagueId/draft/rankings - Pre-draft VBD rankings
  app.get<{
    Params: { leagueId: string };
    Querystring: {
      position?: string;
      limit?: string;
      projectionsRunId?: string;
    };
  }>(
    "/api/leagues/:leagueId/draft/rankings",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
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
  app.get<{
    Params: { leagueId: string };
    Querystring: {
      position?: string;
      limit?: string;
      budget?: string;
      minBid?: string;
      projectionsRunId?: string;
    };
  }>(
    "/api/leagues/:leagueId/draft/auction",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
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
            playersAboveReplacement: valuations.filter(
              (v) => v.dollarValue > minimumBid,
            ).length,
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

  // Generic draft rankings endpoint (no leagueId required)
  app.get<{
    Querystring: {
      numTeams: string;
      categories: string;
      rosterSlots: string;
      projectionsRunId?: string;
      position?: string;
      limit?: string;
    };
  }>(
    "/api/draft/rankings",
    {
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      // Validate and parse config
      const validation = validateDraftConfig(request.query);
      if (!validation.valid) {
        return reply.code(400).send({ error: validation.error });
      }

      const config = validation.config!;
      const { projectionsRunId, position, limit } = request.query;
      const maxPlayers = limit ? parseInt(limit, 10) : 300;

      try {
        const draftAgent = new DraftRankingsAgent(db, request.log as any);

        const rankings = await draftAgent.getRankingsWithConfig(config, {
          projectionsRunId: projectionsRunId
            ? parseInt(projectionsRunId, 10)
            : undefined,
          limit: maxPlayers,
          position: position || undefined,
        });

        return {
          rankings,
          meta: {
            totalTeams: config.totalTeams,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        request.log.error(
          { error },
          "Failed to generate generic draft rankings",
        );
        return reply.code(500).send({
          error: "Failed to generate draft rankings",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Generic auction endpoint (no leagueId required)
  app.get<{
    Querystring: {
      numTeams: string;
      categories: string;
      rosterSlots: string;
      budget?: string;
      minBid?: string;
      projectionsRunId?: string;
      position?: string;
      limit?: string;
    };
  }>(
    "/api/draft/auction",
    {
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      // Validate and parse config
      const validation = validateDraftConfig(request.query);
      if (!validation.valid) {
        return reply.code(400).send({ error: validation.error });
      }

      const config = validation.config!;
      const { budget, minBid, projectionsRunId, position, limit } =
        request.query;

      const auctionBudget = budget ? parseInt(budget, 10) : 260;
      const minimumBid = minBid ? parseInt(minBid, 10) : 1;
      const maxPlayers = limit ? parseInt(limit, 10) : 300;

      // Validate auction params
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
        const draftAgent = new DraftRankingsAgent(db, request.log as any);
        const auctionAgent = new AuctionValuationAgent(
          db,
          draftAgent,
          request.log as any,
        );

        const valuations = await auctionAgent.getValuationsWithConfig(
          { ...config, budget: auctionBudget, minBid: minimumBid },
          {
            projectionsRunId: projectionsRunId
              ? parseInt(projectionsRunId, 10)
              : undefined,
            budget: auctionBudget,
            minBid: minimumBid,
            limit: maxPlayers,
            position: position || undefined,
          },
        );

        return {
          valuations,
          meta: {
            totalTeams: config.totalTeams,
            budget: auctionBudget,
            minBid: minimumBid,
            playersAboveReplacement: valuations.filter(
              (v) => v.dollarValue > minimumBid,
            ).length,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        request.log.error(
          { error },
          "Failed to generate generic auction valuations",
        );
        return reply.code(500).send({
          error: "Failed to generate auction valuations",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}
