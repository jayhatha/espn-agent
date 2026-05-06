import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/connection.js";
import { type ProposedTrade } from "../agents/trade-recommendation.js";
import {
  createWaiverAgent,
  createTradeAgent,
} from "../agents/agent-factory.js";
import { ESPNAdapter } from "../adapters/espn.js";
import { PitcherlistAdapter } from "../adapters/pitcherlist.js";
import { AdvancedStatsAdapter } from "../adapters/advanced-stats.js";
import { getEspnAuthFromEnv } from "../utils/espn-env.js";
import type { ESPNAuthCookies } from "../adapters/espn.js";
import type { StatComponents } from "../../../shared/dist/index.js";
import { decryptToken, hasEncryptionKey } from "../utils/encryption.js";
import { authenticate } from "../middleware/auth.js";
import { FreeAgentView } from "./views/free-agent-view.js";
import { TradeView } from "./views/trade-view.js";

/**
 * Recommendations API Routes
 * Per DESIGN_DOC.md §9.3
 */

export async function recommendationsRoutes(app: FastifyInstance) {
  const db = getDb();

  // Singleton adapters — created once per server startup so their LRU caches
  // survive across requests instead of being discarded after every response.
  const espnAdapter = new ESPNAdapter(app.log);
  const pitcherlistAdapter = new PitcherlistAdapter(app.log);
  const advancedStatsAdapter = new AdvancedStatsAdapter(app.log);

  // Domain views — own query orchestration, adapters remain singleton
  const freeAgentView = new FreeAgentView(
    db,
    espnAdapter,
    pitcherlistAdapter,
    advancedStatsAdapter,
  );
  const tradeView = new TradeView(db);

  const getLeagueEspnContext = async (leagueId: number) => {
    const league = await db
      .selectFrom("league")
      .select([
        "id",
        "espn_league_id",
        "season",
        "espn_swid_encrypted",
        "espn_s2_encrypted",
      ])
      .where("id", "=", leagueId)
      .executeTakeFirst();

    if (!league) {
      return null;
    }

    let espnAuth: ESPNAuthCookies | undefined = getEspnAuthFromEnv();
    if (!espnAuth && league.espn_swid_encrypted && league.espn_s2_encrypted) {
      if (hasEncryptionKey()) {
        try {
          espnAuth = {
            SWID: decryptToken(league.espn_swid_encrypted as any),
            espn_s2: decryptToken(league.espn_s2_encrypted as any),
          };
        } catch (error) {
          app.log.error({ error, leagueId }, "Failed to decrypt ESPN cookies");
        }
      }
    }

    return { league, espnAuth };
  };

  // List available free agents
  app.get<{
    Params: { leagueId: string };
    Querystring: { snapshotDate?: string; limit?: string; position?: string };
  }>(
    "/api/leagues/:leagueId/free-agents",
    { onRequest: [authenticate] },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { snapshotDate, limit, position } = request.query;
      const maxPlayers = limit ? parseInt(limit, 10) : 300;

      const context = await getLeagueEspnContext(leagueId);
      if (!context) {
        return reply.code(404).send({ error: "League not found" });
      }
      const { league, espnAuth } = context;

      // Get latest snapshot date if not provided
      let date = snapshotDate;
      if (!date) {
        const latest = await db
          .selectFrom("league_daily_snapshot")
          .select("snapshot_date")
          .where("league_id", "=", leagueId)
          .orderBy("snapshot_date", "desc")
          .executeTakeFirst();

        date = latest?.snapshot_date;
      }

      try {
        const positions = position
          ? position
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean)
          : undefined;

        return await freeAgentView.fetch({
          leagueId,
          espnLeagueId: league.espn_league_id,
          season: league.season,
          espnAuth,
          snapshotDate: date,
          maxPlayers,
          positions,
        });
      } catch (error) {
        request.log.error({ error }, "Failed to fetch free agents");
        return reply.code(500).send({
          error: "Failed to fetch free agents",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Get team roster
  app.get(
    "/api/leagues/:leagueId/teams/:teamId/roster",
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
        // Get roster
        const roster = await db
          .selectFrom("team_roster_snapshot as roster")
          .innerJoin("player", "roster.player_id", "player.id")
          .select([
            "roster.player_id",
            "player.name as player_name",
            "player.mlb_team",
            "player.positions",
            "roster.roster_status",
            "roster.roster_slot",
            "player.current_season_stats_json",
          ])
          .where("roster.league_id", "=", leagueId)
          .where("roster.team_id", "=", teamId)
          .where("roster.snapshot_date", "=", date)
          .where("roster.roster_status", "in", ["active", "bench"])
          .orderBy("player.name", "asc")
          .execute();

        // Get projections for all players
        const playerIds = roster.map((p) => p.player_id);

        const projections =
          playerIds.length > 0
            ? await db
                .selectFrom("player_projection as proj")
                .innerJoin(
                  "projections_run as run",
                  "proj.projections_run_id",
                  "run.id",
                )
                .select([
                  "proj.player_id",
                  "proj.stat_components_json",
                  "run.as_of_date",
                ])
                .where("run.as_of_date", "<=", date)
                .where("proj.player_id", "in", playerIds)
                .orderBy("run.as_of_date", "desc")
                .execute()
            : [];

        // Create projection map (most recent per player)
        const projectionMap = new Map();
        for (const proj of projections) {
          if (!projectionMap.has(proj.player_id)) {
            projectionMap.set(proj.player_id, proj.stat_components_json);
          }
        }

        // Compute tenure stats: sum components_json from player_period_stats
        // WHERE team_id = teamId (stats accumulated while on this team)
        // Filter to current season only (snapshot_date in current year)
        const seasonStart = `${new Date().getFullYear()}-01-01`;
        const tenureRows =
          playerIds.length > 0
            ? await db
                .selectFrom("player_period_stats")
                .select(["player_id", "components_json"])
                .where("league_id", "=", leagueId)
                .where("team_id", "=", teamId)
                .where("player_id", "in", playerIds)
                .where("snapshot_date", ">=", seasonStart)
                .execute()
            : [];

        // Aggregate components across all scoring periods per player
        const tenureMap = new Map<number, Record<string, number>>();
        for (const row of tenureRows) {
          const existing = tenureMap.get(row.player_id) ?? {};
          const components = row.components_json as Record<string, number>;
          for (const [key, value] of Object.entries(components)) {
            if (typeof value === "number") {
              existing[key] = (existing[key] ?? 0) + value;
            }
          }
          tenureMap.set(row.player_id, existing);
        }

        const advancedStatsMap =
          await advancedStatsAdapter.getAdvancedStatsForPlayers(
            new Date(date).getFullYear(),
            roster.map((player) => ({
              playerId: player.player_id,
              playerName: player.player_name,
              mlbTeam: player.mlb_team,
              positions: player.positions,
              currentStats:
                ((player as any).current_season_stats_json as Record<
                  string,
                  number
                > | null) ?? null,
            })),
          );

        // Enrich roster with projection and tenure data (player.id IS ESPN ID after migration 016)
        const enrichedRoster = roster.map((player) => ({
          playerId: player.player_id,
          espnPlayerId: player.player_id,
          playerName: player.player_name,
          mlbTeam: player.mlb_team,
          positions: player.positions,
          rosterStatus: player.roster_status,
          rosterSlot: player.roster_slot,
          projections: projectionMap.get(player.player_id) || null,
          currentStats: (player as any).current_season_stats_json || null,
          advancedStats: advancedStatsMap.get(player.player_id) ?? null,
          tenureStats: (() => {
            const agg = tenureMap.get(player.player_id);
            return agg && Object.keys(agg).length > 0 ? agg : null;
          })(),
        }));

        return { roster: enrichedRoster, snapshotDate: date };
      } catch (error) {
        request.log.error({ error }, "Failed to fetch roster");
        return reply.code(500).send({
          error: "Failed to fetch roster",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Evaluate add/drop impact
  app.post(
    "/api/leagues/:leagueId/teams/:teamId/waivers/evaluate",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
        Body: {
          addPlayerId: number;
          dropPlayerId: number;
          snapshotDate?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const { addPlayerId, dropPlayerId, snapshotDate } = request.body;

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
        const waiverAgent = createWaiverAgent(db, request.log, espnAdapter);

        // Get player names
        const [addPlayer, dropPlayer] = await Promise.all([
          db
            .selectFrom("player")
            .select(["id", "name", "positions"])
            .where("id", "=", addPlayerId)
            .executeTakeFirst(),
          db
            .selectFrom("player")
            .select(["id", "name", "positions"])
            .where("id", "=", dropPlayerId)
            .executeTakeFirst(),
        ]);

        if (!addPlayer || !dropPlayer) {
          return reply.code(404).send({ error: "Player not found" });
        }

        // Get baseline projections
        const baseline = await db
          .selectFrom("team_daily_projected_overall")
          .select("projected_overall_points")
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", date)
          .where("team_id", "=", teamId)
          .executeTakeFirst();

        if (!baseline) {
          return reply.code(404).send({
            error:
              "No projected standings found. Please upload projections and run a snapshot first.",
          });
        }

        // Simulate the swap - using private method through reflection is tricky,
        // so we'll just call getRecommendations with specific players
        const recommendations = await waiverAgent.getRecommendations(
          leagueId,
          teamId,
          date,
          {
            maxRecommendations: 100,
            freeAgentPlayerIds: [addPlayerId],
          },
        );

        // Find the specific recommendation for this swap
        const recommendation = recommendations.find(
          (r) =>
            r.addPlayerId === addPlayerId && r.dropPlayerId === dropPlayerId,
        );

        if (recommendation) {
          return {
            addPlayer: {
              id: addPlayerId,
              name: addPlayer.name,
              positions: addPlayer.positions,
            },
            dropPlayer: {
              id: dropPlayerId,
              name: dropPlayer.name,
              positions: dropPlayer.positions,
            },
            deltaOverallPoints: recommendation.deltaOverallPoints,
            categoryImpacts: recommendation.categoryImpacts,
            explanation: recommendation.explanation,
            isLegal: recommendation.isLegal,
            legalityIssues: recommendation.legalityIssues,
            snapshotDate: date,
          };
        } else {
          // No impact or negative impact
          return {
            addPlayer: {
              id: addPlayerId,
              name: addPlayer.name,
              positions: addPlayer.positions,
            },
            dropPlayer: {
              id: dropPlayerId,
              name: dropPlayer.name,
              positions: dropPlayer.positions,
            },
            deltaOverallPoints: 0,
            categoryImpacts: [],
            explanation:
              "This swap would not improve your projected standings.",
            isLegal: true,
            snapshotDate: date,
          };
        }
      } catch (error) {
        request.log.error({ error }, "Failed to evaluate add/drop");
        return reply.code(500).send({
          error: "Failed to evaluate add/drop",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Waiver recommendations
  app.get(
    "/api/leagues/:leagueId/teams/:teamId/waivers/recommendations",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
        Querystring: { snapshotDate?: string; maxRecommendations?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const { snapshotDate, maxRecommendations } = request.query;

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

      const waiverAgent = createWaiverAgent(db, request.log, espnAdapter);

      try {
        let freeAgentPlayerIds: number[] | undefined;
        const fallbackFreeAgentPlayers = new Map<
          number,
          { id: number; name: string; positions: string[] }
        >();
        const fallbackFreeAgentProjections = new Map<number, StatComponents>();

        const snapshot = await db
          .selectFrom("league_daily_snapshot")
          .select("projections_run_id")
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", date)
          .executeTakeFirst();

        const filterToProjectedFreeAgents = async (playerIds: number[]) => {
          if (playerIds.length === 0 || !snapshot?.projections_run_id) {
            return playerIds;
          }

          const projectedFreeAgents = await db
            .selectFrom("player_projection")
            .select("player_id")
            .where("projections_run_id", "=", snapshot.projections_run_id)
            .where("player_id", "in", playerIds)
            .execute();

          return projectedFreeAgents.map((player) => player.player_id);
        };

        const addEspnFallbackProjections = async (playerIds: number[]) => {
          if (playerIds.length === 0 || !context) {
            return;
          }

          const liveIdSet = new Set(playerIds);
          const draftData = await espnAdapter.fetchGlobalDraftData({
            season: context.league.season,
            limit: 1500,
          });

          for (const player of draftData) {
            if (!liveIdSet.has(player.playerId) || !player.espnProjectedStats) {
              continue;
            }

            fallbackFreeAgentPlayers.set(player.playerId, {
              id: player.playerId,
              name: player.playerName,
              positions: player.positions,
            });
            fallbackFreeAgentProjections.set(
              player.playerId,
              player.espnProjectedStats as StatComponents,
            );
          }
        };

        const context = await getLeagueEspnContext(leagueId);
        if (context) {
          try {
            const liveFreeAgents = await espnAdapter.fetchFreeAgents({
              leagueId: context.league.espn_league_id,
              season: context.league.season,
              auth: context.espnAuth,
              limit: 1500,
            });
            if (liveFreeAgents.length > 0) {
              const liveIds = liveFreeAgents.map((player) => player.playerId);
              const projectedLiveIds = await filterToProjectedFreeAgents(liveIds);
              await addEspnFallbackProjections(liveIds);
              freeAgentPlayerIds =
                projectedLiveIds.length > 0
                  ? [...new Set([...projectedLiveIds, ...fallbackFreeAgentProjections.keys()])]
                  : [...new Set([...liveIds, ...fallbackFreeAgentProjections.keys()])];
            }
          } catch (error) {
            request.log.warn(
              { error, leagueId, snapshotDate: date },
              "Failed to fetch live ESPN free agents for waiver recommendations",
            );
          }
        }

        if (!freeAgentPlayerIds || freeAgentPlayerIds.length === 0) {
          const snapshotFreeAgents = await db
            .selectFrom("league_free_agent_snapshot")
            .select("player_id")
            .where("league_id", "=", leagueId)
            .where("snapshot_date", "=", date)
            .execute();

          if (snapshotFreeAgents.length > 0) {
            const snapshotIds = snapshotFreeAgents.map((player) => player.player_id);
            const projectedSnapshotIds = await filterToProjectedFreeAgents(
              snapshotIds,
            );
            await addEspnFallbackProjections(snapshotIds);
            freeAgentPlayerIds =
              projectedSnapshotIds.length > 0
                ? [
                    ...new Set([
                      ...projectedSnapshotIds,
                      ...fallbackFreeAgentProjections.keys(),
                    ]),
                  ]
                : [
                    ...new Set([
                      ...snapshotIds,
                      ...fallbackFreeAgentProjections.keys(),
                    ]),
                  ];
          }
        }

        const recommendations = await waiverAgent.getRecommendations(
          leagueId,
          teamId,
          date,
          {
            maxRecommendations: maxRecommendations
              ? parseInt(maxRecommendations, 10)
              : 10,
            freeAgentPlayerIds,
            fallbackPlayers: [...fallbackFreeAgentPlayers.values()],
            fallbackProjections: Object.fromEntries(
              fallbackFreeAgentProjections.entries(),
            ),
          },
        );
        return { recommendations, snapshotDate: date };
      } catch (error) {
        request.log.error(
          { error, leagueId, teamId },
          "Failed to compute waiver recommendations",
        );
        return reply.code(500).send({
          error: "Failed to compute waiver recommendations",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Trade impact analysis
  app.post(
    "/api/leagues/:leagueId/teams/:teamId/trades/impact",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
        Body: { trade: ProposedTrade; snapshotDate?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const { trade, snapshotDate } = request.body;

      if (!trade || !trade.givePlayers || !trade.receivePlayers) {
        return reply.code(400).send({
          error:
            "Invalid trade format. Must include givePlayers and receivePlayers.",
        });
      }

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

      const tradeAgent = createTradeAgent(db, request.log);

      try {
        const analysis = await tradeAgent.analyzeTradeImpact(
          leagueId,
          teamId,
          date,
          trade,
        );

        return { analysis, snapshotDate: date };
      } catch (error) {
        request.log.error({ error }, "Trade impact analysis failed");
        return reply.code(500).send({
          error: "Failed to analyze trade impact",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Trade candidate generation
  app.get(
    "/api/leagues/:leagueId/teams/:teamId/trades/recommendations",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
        Querystring: { snapshotDate?: string; maxCandidates?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const { snapshotDate, maxCandidates } = request.query;

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

      const tradeAgent = createTradeAgent(db, request.log);

      try {
        const candidates = await tradeAgent.generateTradeCandidates(
          leagueId,
          teamId,
          date,
          maxCandidates ? parseInt(maxCandidates, 10) : 10,
        );

        return { candidates, snapshotDate: date };
      } catch (error) {
        request.log.error({ error }, "Trade candidate generation failed");
        return reply.code(500).send({
          error: "Failed to generate trade candidates",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Get rosters for manual trade building
  app.get(
    "/api/leagues/:leagueId/teams/:teamId/trades/partners/:partnerTeamId/rosters",
    async (
      request: FastifyRequest<{
        Params: {
          leagueId: string;
          teamId: string;
          partnerTeamId: string;
        };
        Querystring: { snapshotDate?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const partnerTeamId = parseInt(request.params.partnerTeamId, 10);
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
        const result = await tradeView.getRosterPair(
          leagueId,
          teamId,
          partnerTeamId,
          date,
        );

        if (!result) {
          return reply.code(404).send({ error: "Team not found" });
        }

        return result;
      } catch (error) {
        request.log.error({ error }, "Failed to get trade partner rosters");
        return reply.code(500).send({
          error: "Failed to get rosters",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // List potential trade partners
  app.get(
    "/api/leagues/:leagueId/teams/:teamId/trades/partners",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      try {
        // Get all other teams in the league
        const teams = await db
          .selectFrom("team")
          .select(["id", "name", "espn_team_id"])
          .where("league_id", "=", leagueId)
          .where("id", "!=", teamId)
          .orderBy("name", "asc")
          .execute();

        return { partners: teams };
      } catch (error) {
        request.log.error({ error }, "Failed to get trade partners");
        return reply.code(500).send({
          error: "Failed to get trade partners",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Draft recommendations (placeholder)
  app.get(
    "/api/leagues/:leagueId/draft/recommendations",
    async (_request, _reply) => {
      return { message: "Draft recommendations - to be implemented" };
    },
  );
}
