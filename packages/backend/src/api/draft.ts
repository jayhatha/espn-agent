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

  // GET /api/leagues/:leagueId/draft/auction/validate - Compare ESPN vs VBD auction values
  app.get<{
    Params: { leagueId: string };
    Querystring: {
      limit?: string;
      projectionsRunId?: string;
    };
  }>(
    "/api/leagues/:leagueId/draft/auction/validate",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { limit, projectionsRunId } = request.query;
      const maxPlayers = limit ? parseInt(limit, 10) : 100;

      try {
        // Get league info
        const league = await db
          .selectFrom("league")
          .select(["id", "name", "espn_league_id", "season"])
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

        // Get league settings for budget
        const latestSettings = await db
          .selectFrom("league_settings_version")
          .selectAll()
          .where("league_id", "=", leagueId)
          .orderBy("effective_date", "desc")
          .executeTakeFirst();

        if (!latestSettings) {
          return reply.code(404).send({
            error: "League settings not found. Please sync league data first.",
          });
        }

        const settings = latestSettings.settings_json as any;
        const acquisitionRules = settings.acquisition_rules || {};
        const budget = acquisitionRules.auction_budget || 260; // Default ESPN auction budget

        // Fetch ESPN's global draft data (auction values + ADP)
        const { ESPNAdapter } = await import("../adapters/espn.js");
        const espnAdapter = new ESPNAdapter(request.log as any);
        const espnDraftData = await espnAdapter.fetchGlobalDraftData({
          season: league.season,
        });

        if (espnDraftData.length === 0) {
          return reply.code(400).send({
            error: "ESPN draft data not available for this season",
            details:
              "Could not fetch global draft rankings from ESPN. " +
              "This may occur if the season has not started yet.",
          });
        }

        // Fetch our VBD auction values
        const draftAgent = new DraftRankingsAgent(db, request.log as any);
        const auctionAgent = new AuctionValuationAgent(
          db,
          draftAgent,
          request.log as any,
        );

        const ourValuations = await auctionAgent.getValuations(leagueId, {
          projectionsRunId: projectionsRunId
            ? parseInt(projectionsRunId, 10)
            : undefined,
          budget,
          minBid: 1,
          limit: 500,
        });

        // Create a map of our valuations by player ID
        const ourValueMap = new Map(
          ourValuations.map((v) => [v.playerId, v.dollarValue]),
        );

        // Join on player ID and calculate deltas
        interface Comparison {
          playerId: number;
          playerName: string;
          positions: string[];
          espnValue: number;
          espnAdp: number;
          espnAvgAuction: number;
          ourValue: number;
          absoluteDelta: number;
          percentDelta: number;
          ratio: number;
        }

        const comparisons: Comparison[] = [];

        for (const espnPlayer of espnDraftData) {
          if (espnPlayer.espnAuctionValue <= 0) continue;
          const ourValue = ourValueMap.get(espnPlayer.playerId);
          if (ourValue === undefined) continue;

          const absoluteDelta = ourValue - espnPlayer.espnAuctionValue;
          const percentDelta =
            (absoluteDelta / espnPlayer.espnAuctionValue) * 100;
          const ratio = ourValue / espnPlayer.espnAuctionValue;

          comparisons.push({
            playerId: espnPlayer.playerId,
            playerName: espnPlayer.playerName,
            positions: espnPlayer.positions,
            espnValue: espnPlayer.espnAuctionValue,
            espnAdp: espnPlayer.averageDraftPosition,
            espnAvgAuction: espnPlayer.averageAuctionValue,
            ourValue,
            absoluteDelta,
            percentDelta,
            ratio,
          });
        }

        if (comparisons.length === 0) {
          return reply.code(400).send({
            error: "No common players found between ESPN and our valuations",
            details:
              "This may occur if projections are missing or player matching failed.",
          });
        }

        // Calculate summary statistics
        const deltas = comparisons.map((c) => c.absoluteDelta);
        const sortedDeltas = [...deltas].sort((a, b) => a - b);
        const meanDelta =
          deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
        const medianDelta =
          sortedDeltas.length % 2 === 0
            ? (sortedDeltas[sortedDeltas.length / 2 - 1] +
                sortedDeltas[sortedDeltas.length / 2]) /
              2
            : sortedDeltas[Math.floor(sortedDeltas.length / 2)];

        // RMSE: sqrt(sum((ourValue - espnValue)^2) / n)
        const squaredErrors = comparisons.map(
          (c) => Math.pow(c.absoluteDelta, 2),
        );
        const rmse = Math.sqrt(
          squaredErrors.reduce((sum, e) => sum + e, 0) / comparisons.length,
        );

        // Pearson correlation coefficient
        const espnValues_nums = comparisons.map((c) => c.espnValue);
        const ourValues_nums = comparisons.map((c) => c.ourValue);
        const meanEspn =
          espnValues_nums.reduce((sum, v) => sum + v, 0) /
          espnValues_nums.length;
        const meanOur =
          ourValues_nums.reduce((sum, v) => sum + v, 0) / ourValues_nums.length;

        const covariance =
          comparisons.reduce(
            (sum, c) =>
              sum + (c.espnValue - meanEspn) * (c.ourValue - meanOur),
            0,
          ) / comparisons.length;

        const stdDevEspn = Math.sqrt(
          espnValues_nums.reduce(
            (sum, v) => sum + Math.pow(v - meanEspn, 2),
            0,
          ) / espnValues_nums.length,
        );
        const stdDevOur = Math.sqrt(
          ourValues_nums.reduce((sum, v) => sum + Math.pow(v - meanOur, 2), 0) /
            ourValues_nums.length,
        );

        const correlation =
          stdDevEspn === 0 || stdDevOur === 0
            ? 0
            : covariance / (stdDevEspn * stdDevOur);

        // Find top players in each system
        const espnTop = [...comparisons].sort(
          (a, b) => b.espnValue - a.espnValue,
        )[0];
        const ourTop = [...comparisons].sort(
          (a, b) => b.ourValue - a.ourValue,
        )[0];

        // Apply limit to returned comparisons
        const limitedComparisons = comparisons.slice(0, maxPlayers);

        const result = {
          comparisons: limitedComparisons,
          summary: {
            totalCompared: comparisons.length,
            meanDelta: Math.round(meanDelta * 100) / 100,
            medianDelta: Math.round(medianDelta * 100) / 100,
            rmse: Math.round(rmse * 100) / 100,
            correlation: Math.round(correlation * 1000) / 1000,
            ourTopPlayer: {
              name: ourTop.playerName,
              value: ourTop.ourValue,
            },
            espnTopPlayer: {
              name: espnTop.playerName,
              value: espnTop.espnValue,
            },
          },
          meta: {
            leagueId,
            totalTeams,
            budget,
            generatedAt: new Date().toISOString(),
          },
        };

        // Add warning if small overlap
        if (comparisons.length < 10) {
          (result as any).warning =
            "Small sample size - fewer than 10 overlapping players found. Results may not be statistically meaningful.";
        }

        return result;
      } catch (error) {
        request.log.error(
          { error },
          "Failed to validate auction values",
        );
        return reply.code(500).send({
          error: "Failed to validate auction values",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // GET /api/draft/auction/validate - Generic auction validation (no leagueId required)
  app.get<{
    Querystring: {
      numTeams: string;
      categories: string;
      rosterSlots: string;
      budget?: string;
      minBid?: string;
      projectionsRunId?: string;
      limit?: string;
      espnSeason?: string;
    };
  }>(
    "/api/draft/auction/validate",
    {
      config: {
        rateLimit: {
          max: 50,
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
      const {
        budget,
        minBid,
        projectionsRunId,
        limit,
        espnSeason,
      } = request.query;

      const auctionBudget = budget ? parseInt(budget, 10) : 260;
      const minimumBid = minBid ? parseInt(minBid, 10) : 1;
      const maxPlayers = limit ? parseInt(limit, 10) : 100;

      const espnSeasonNum = espnSeason
        ? parseInt(espnSeason, 10)
        : new Date().getFullYear();
      if (!Number.isInteger(espnSeasonNum)) {
        return reply.code(400).send({
          error: `espnSeason must be a valid integer (received ${espnSeason})`,
        });
      }

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
        // Fetch ESPN's global draft data (auction values + ADP)
        const { ESPNAdapter } = await import("../adapters/espn.js");
        const espnAdapter = new ESPNAdapter(request.log as any);

        const espnDraftData = await espnAdapter.fetchGlobalDraftData({
          season: espnSeasonNum,
        });

        if (espnDraftData.length === 0) {
          return reply.code(400).send({
            error: "ESPN draft data not available",
            details:
              "Could not fetch global draft rankings from ESPN. " +
              "This may occur if the season has not started yet.",
          });
        }

        // Fetch our VBD auction values using generic config
        const draftAgent = new DraftRankingsAgent(db, request.log as any);
        const auctionAgent = new AuctionValuationAgent(
          db,
          draftAgent,
          request.log as any,
        );

        const ourValuations = await auctionAgent.getValuationsWithConfig(
          { ...config, budget: auctionBudget, minBid: minimumBid },
          {
            projectionsRunId: projectionsRunId
              ? parseInt(projectionsRunId, 10)
              : undefined,
            budget: auctionBudget,
            minBid: minimumBid,
            limit: 500,
          },
        );

        // Create a map of our valuations by player ID
        const ourValueMap = new Map(
          ourValuations.map((v) => [v.playerId, v.dollarValue]),
        );

        // Join on player ID and calculate deltas
        interface Comparison {
          playerId: number;
          playerName: string;
          positions: string[];
          espnValue: number;
          espnAdp: number;
          espnAvgAuction: number;
          ourValue: number;
          absoluteDelta: number;
          percentDelta: number;
          ratio: number;
        }

        const comparisons: Comparison[] = [];

        for (const espnPlayer of espnDraftData) {
          if (espnPlayer.espnAuctionValue <= 0) continue;
          const ourValue = ourValueMap.get(espnPlayer.playerId);
          if (ourValue === undefined) continue;

          const absoluteDelta = ourValue - espnPlayer.espnAuctionValue;
          const percentDelta =
            (absoluteDelta / espnPlayer.espnAuctionValue) * 100;
          const ratio = ourValue / espnPlayer.espnAuctionValue;

          comparisons.push({
            playerId: espnPlayer.playerId,
            playerName: espnPlayer.playerName,
            positions: espnPlayer.positions,
            espnValue: espnPlayer.espnAuctionValue,
            espnAdp: espnPlayer.averageDraftPosition,
            espnAvgAuction: espnPlayer.averageAuctionValue,
            ourValue,
            absoluteDelta,
            percentDelta,
            ratio,
          });
        }

        if (comparisons.length === 0) {
          return reply.code(400).send({
            error: "No common players found between ESPN and our valuations",
            details:
              "This may occur if projections are missing or player matching failed.",
          });
        }

        // Calculate summary statistics
        const deltas = comparisons.map((c) => c.absoluteDelta);
        const sortedDeltas = [...deltas].sort((a, b) => a - b);
        const meanDelta =
          deltas.reduce((sum, d) => sum + d, 0) / deltas.length;
        const medianDelta =
          sortedDeltas.length % 2 === 0
            ? (sortedDeltas[sortedDeltas.length / 2 - 1] +
                sortedDeltas[sortedDeltas.length / 2]) /
              2
            : sortedDeltas[Math.floor(sortedDeltas.length / 2)];

        // RMSE
        const squaredErrors = comparisons.map(
          (c) => Math.pow(c.absoluteDelta, 2),
        );
        const rmse = Math.sqrt(
          squaredErrors.reduce((sum, e) => sum + e, 0) / comparisons.length,
        );

        // Pearson correlation coefficient
        const espnValues_nums = comparisons.map((c) => c.espnValue);
        const ourValues_nums = comparisons.map((c) => c.ourValue);
        const meanEspn =
          espnValues_nums.reduce((sum, v) => sum + v, 0) /
          espnValues_nums.length;
        const meanOur =
          ourValues_nums.reduce((sum, v) => sum + v, 0) / ourValues_nums.length;

        const covariance =
          comparisons.reduce(
            (sum, c) =>
              sum + (c.espnValue - meanEspn) * (c.ourValue - meanOur),
            0,
          ) / comparisons.length;

        const stdDevEspn = Math.sqrt(
          espnValues_nums.reduce(
            (sum, v) => sum + Math.pow(v - meanEspn, 2),
            0,
          ) / espnValues_nums.length,
        );
        const stdDevOur = Math.sqrt(
          ourValues_nums.reduce((sum, v) => sum + Math.pow(v - meanOur, 2), 0) /
            ourValues_nums.length,
        );

        const correlation =
          stdDevEspn === 0 || stdDevOur === 0
            ? 0
            : covariance / (stdDevEspn * stdDevOur);

        // Find top players in each system
        const espnTop = [...comparisons].sort(
          (a, b) => b.espnValue - a.espnValue,
        )[0];
        const ourTop = [...comparisons].sort(
          (a, b) => b.ourValue - a.ourValue,
        )[0];

        // Apply limit (sorted by absolute delta descending)
        const limitedComparisons = [...comparisons]
          .sort((a, b) => Math.abs(b.absoluteDelta) - Math.abs(a.absoluteDelta))
          .slice(0, maxPlayers);

        const result = {
          comparisons: limitedComparisons,
          summary: {
            totalCompared: comparisons.length,
            meanDelta: Math.round(meanDelta * 100) / 100,
            medianDelta: Math.round(medianDelta * 100) / 100,
            rmse: Math.round(rmse * 100) / 100,
            correlation: Math.round(correlation * 1000) / 1000,
            ourTopPlayer: {
              name: ourTop.playerName,
              value: ourTop.ourValue,
            },
            espnTopPlayer: {
              name: espnTop.playerName,
              value: espnTop.espnValue,
            },
          },
          meta: {
            totalTeams: config.totalTeams,
            budget: auctionBudget,
            minBid: minimumBid,
            espnSeason: espnSeasonNum,
            generatedAt: new Date().toISOString(),
          },
        };

        if (comparisons.length < 10) {
          (result as any).warning =
            "Small sample size - fewer than 10 overlapping players found. Results may not be statistically meaningful.";
        }

        return result;
      } catch (error) {
        request.log.error(
          { error },
          "Failed to validate generic auction values",
        );
        return reply.code(500).send({
          error: "Failed to validate auction values",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // POST /api/draft/projected-standings - League-agnostic projected standings
  app.post<{
    Body: {
      config: DraftConfiguration;
      rosters: TeamRoster[];
      projectionsRunId?: number;
    };
  }>(
    "/api/draft/projected-standings",
    {
      config: {
        rateLimit: {
          max: 50,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const { config, rosters, projectionsRunId } = request.body;

      // Validate config
      if (!config || !config.categories || !config.rosterSlots || !config.totalTeams) {
        return reply.code(400).send({ error: "Invalid draft configuration" });
      }

      // Validate rosters
      if (!Array.isArray(rosters) || rosters.length === 0) {
        return reply.code(400).send({ error: "Rosters array required" });
      }

      for (const roster of rosters) {
        if (!roster.teamId || !roster.players || !Array.isArray(roster.players)) {
          return reply.code(400).send({ error: "Invalid roster format" });
        }
      }

      try {
        const draftAgent = new DraftRankingsAgent(db, request.log as any);

        const result = await draftAgent.calculateProjectedStandings(
          config,
          rosters,
          { projectionsRunId },
        );

        return {
          standings: result.standings,
          meta: {
            totalTeams: config.totalTeams,
            categories: config.categories.map(c => c.name),
            generatedAt: result.generatedAt,
          },
        };
      } catch (error) {
        request.log.error({ error }, "Failed to calculate projected standings");
        return reply.code(500).send({
          error: "Failed to calculate projected standings",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
  // GET /api/draft/espn - Fetch ESPN global draft data (ADP + auction values)
  app.get<{
    Querystring: {
      season?: string;
      limit?: string;
    };
  }>(
    "/api/draft/espn",
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const season = request.query.season
        ? parseInt(request.query.season, 10)
        : new Date().getFullYear();
      const maxPlayers = request.query.limit
        ? parseInt(request.query.limit, 10)
        : 500;

      try {
        const { ESPNAdapter } = await import("../adapters/espn.js");
        const espnAdapter = new ESPNAdapter(request.log as any);

        const draftData = await espnAdapter.fetchGlobalDraftData({
          season,
          limit: maxPlayers,
        });

        return {
          players: draftData,
          meta: {
            season,
            totalPlayers: draftData.length,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (error) {
        request.log.error({ error }, "Failed to fetch ESPN draft data");
        return reply.code(500).send({
          error: "Failed to fetch ESPN draft data",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );
}

/**
 * Types for projected standings API
 */
interface TeamRoster {
  teamId: number;
  teamName: string;
  players: { playerId: number }[];
}
