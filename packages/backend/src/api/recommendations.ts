import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { getDb } from "../db/connection.js";
import {
  TradeRecommendationAgent,
  type ProposedTrade,
} from "../agents/trade-recommendation.js";
import { createWaiverAgent } from "../agents/agent-factory.js";
import { getEspnAuthFromEnv } from "../utils/espn-env.js";
import type { ESPNAuthCookies } from "../adapters/espn.js";
import type { StatComponents } from "../../../shared/dist/index.js";
import { combineComponents } from "../../../shared/dist/index.js";
import { decryptToken, hasEncryptionKey } from "../utils/encryption.js";
import { authenticate } from "../middleware/auth.js";
import { FreeAgentView } from "./views/free-agent-view.js";
import { TradeView } from "./views/trade-view.js";
import { SnapshotRepository } from "../db/snapshot-repository.js";

const waiverEvaluateBodySchema = z.object({
  addPlayerId: z.number().int().positive(),
  dropPlayerId: z.number().int().positive().optional(),
  snapshotDate: z.string().optional(),
  projectionsRunId: z.number().int().positive().optional(),
});

/**
 * Recommendations API Routes
 * Per DESIGN_DOC.md §9.3
 */

export async function recommendationsRoutes(app: FastifyInstance) {
  const db = getDb();
  const repo = new SnapshotRepository(db);

  // Adapters from container — process-scope singletons, LRU caches persist across requests
  const espnAdapter = app.container.adapters.espn;
  const pitcherlistAdapter = app.container.adapters.pitcherlist;
  const advancedStatsAdapter = app.container.adapters.advancedStats;

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
        // Use the most recent date where this team actually has roster data,
        // falling back to league_daily_snapshot if team_roster_snapshot is empty.
        const latestTeamRoster = await db
          .selectFrom("team_roster_snapshot")
          .select("snapshot_date")
          .where("league_id", "=", leagueId)
          .where("team_id", "=", teamId)
          .orderBy("snapshot_date", "desc")
          .executeTakeFirst();

        if (latestTeamRoster) {
          date = latestTeamRoster.snapshot_date;
        } else {
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

        const { projections: allProjections } =
          await repo.getProjectionsByDate(date);
        const playerIdSet = new Set(playerIds);
        const projections = allProjections.filter((p) =>
          playerIdSet.has(p.player_id),
        );

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

        // Full-season stats across all teams for blending with RoS projections
        const seasonRows =
          playerIds.length > 0
            ? await db
                .selectFrom("player_period_stats")
                .select(["player_id", "components_json"])
                .where("league_id", "=", leagueId)
                .where("player_id", "in", playerIds)
                .where("snapshot_date", ">=", seasonStart)
                .execute()
            : [];

        const seasonStatsMap = new Map<number, StatComponents>();
        for (const row of seasonRows) {
          const existing =
            seasonStatsMap.get(row.player_id) ?? ({} as StatComponents);
          const components = row.components_json as StatComponents;
          for (const [key, value] of Object.entries(components)) {
            if (typeof value === "number") {
              (existing as Record<string, number>)[key] =
                ((existing as Record<string, number>)[key] ?? 0) + value;
            }
          }
          seasonStatsMap.set(row.player_id, existing);
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
          blendedProjections: (() => {
            const ros = projectionMap.get(player.player_id) as
              | StatComponents
              | undefined;
            const current = seasonStatsMap.get(player.player_id);
            if (!ros && !current) return null;
            return combineComponents(
              current ?? ({} as StatComponents),
              ros ?? ({} as StatComponents),
            );
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

  // Evaluate add/drop impact — Phase 108: delegates to ScenarioEvaluationAgent
  app.post(
    "/api/leagues/:leagueId/teams/:teamId/waivers/evaluate",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
        Body: {
          addPlayerId: number;
          dropPlayerId: number;
          snapshotDate?: string;
          projectionsRunId?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      const parseResult = waiverEvaluateBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(400).send({
          error: "Invalid request body",
          details: parseResult.error.flatten().fieldErrors,
        });
      }
      const { addPlayerId, dropPlayerId, snapshotDate, projectionsRunId } =
        parseResult.data;

      // Resolve snapshot date
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

      // Resolve projections run
      let runId = projectionsRunId;
      if (!runId) {
        const latestRun = await db
          .selectFrom("projections_run")
          .select("id")
          .where("staleness", "=", "fresh")
          .orderBy("ingested_at", "desc")
          .executeTakeFirst();

        if (!latestRun) {
          return reply
            .code(404)
            .send({ error: "No fresh projections run found" });
        }
        runId = latestRun.id;
      }

      if (dropPlayerId == null) {
        return reply.code(400).send({ error: "dropPlayerId is required" });
      }

      try {
        const waiverAgent = createWaiverAgent(db, request.log, espnAdapter);
        const result = await waiverAgent.evaluateAddDropImpact({
          leagueId,
          teamId,
          snapshotDate: date,
          projectionsRunId: runId as number,
          addPlayerId,
          dropPlayerId,
        });

        // Look up player info for the response shape the frontend expects
        const [addPlayerRow, dropPlayerRow] = await Promise.all([
          db
            .selectFrom("player")
            .select(["id", "name", "positions"])
            .where("id", "=", addPlayerId)
            .executeTakeFirst(),
          dropPlayerId != null
            ? db
                .selectFrom("player")
                .select(["id", "name", "positions"])
                .where("id", "=", dropPlayerId)
                .executeTakeFirst()
            : Promise.resolve(undefined),
        ]);

        // Fetch category names so we can build the categoryImpacts array
        const categoryImpacts = Object.entries(result.categoryDeltas).map(
          ([categoryId, deltaPoints]) => ({
            categoryId,
            categoryName: categoryId,
            deltaRank: 0,
            deltaPoints,
          }),
        );

        const sign = result.deltaOverallPoints >= 0 ? "+" : "";
        const explanation =
          result.blockingIssues.length > 0
            ? `This move is not legal: ${result.blockingIssues.join("; ")}.`
            : `This add/drop projects a ${sign}${result.deltaOverallPoints.toFixed(1)} point change in overall standings.`;

        return {
          addPlayer: addPlayerRow
            ? {
                id: addPlayerRow.id,
                name: addPlayerRow.name,
                positions: addPlayerRow.positions,
              }
            : { id: addPlayerId, name: "Unknown", positions: [] },
          dropPlayer: dropPlayerRow
            ? {
                id: dropPlayerRow.id,
                name: dropPlayerRow.name,
                positions: dropPlayerRow.positions,
              }
            : { id: dropPlayerId, name: "Unknown", positions: [] },
          isLegal: result.isLegal,
          legalityIssues: result.blockingIssues,
          deltaOverallPoints: result.deltaOverallPoints,
          categoryImpacts,
          explanation,
          degradedReasons: result.degradedReasons,
          snapshotDate: date,
        };
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

          const projectedFreeAgents = await repo.getPlayerProjections(
            snapshot.projections_run_id,
            playerIds,
          );

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
              const projectedLiveIds =
                await filterToProjectedFreeAgents(liveIds);
              await addEspnFallbackProjections(liveIds);
              freeAgentPlayerIds =
                projectedLiveIds.length > 0
                  ? [
                      ...new Set([
                        ...projectedLiveIds,
                        ...fallbackFreeAgentProjections.keys(),
                      ]),
                    ]
                  : [
                      ...new Set([
                        ...liveIds,
                        ...fallbackFreeAgentProjections.keys(),
                      ]),
                    ];
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
            const snapshotIds = snapshotFreeAgents.map(
              (player) => player.player_id,
            );
            const projectedSnapshotIds =
              await filterToProjectedFreeAgents(snapshotIds);
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

  // Trade roster-slot validation (real-time, non-blocking)
  app.post(
    "/api/leagues/:leagueId/teams/:teamId/trades/validate",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
        Body: unknown;
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      const body = request.body as
        | { givePlayers?: unknown; receivePlayers?: unknown }
        | null
        | undefined;

      if (
        !Array.isArray(body?.givePlayers) ||
        !Array.isArray(body?.receivePlayers)
      ) {
        return reply.code(400).send({
          error: "givePlayers and receivePlayers arrays required",
        });
      }

      const trade: ProposedTrade = {
        givePlayers: (body.givePlayers as number[]).map((id) => ({
          playerId: id,
          playerName: "",
        })),
        receivePlayers: (body.receivePlayers as number[]).map((id) => ({
          playerId: id,
          playerName: "",
        })),
      };

      const sizeCheck = TradeRecommendationAgent.validateTradeSize(trade);
      if (!sizeCheck.valid) {
        return { isLegal: false, issues: [sizeCheck.error!] };
      }

      const latest = await db
        .selectFrom("league_daily_snapshot")
        .select("snapshot_date")
        .where("league_id", "=", leagueId)
        .orderBy("snapshot_date", "desc")
        .executeTakeFirst();

      if (!latest) {
        return reply.code(404).send({ error: "No snapshots found for league" });
      }

      const tradeAgent = app.container.agents.tradeRecommendation(
        db,
        request.log,
      );

      try {
        const result = await tradeAgent.validateRosterSlots(
          leagueId,
          teamId,
          latest.snapshot_date,
          trade,
        );
        return result;
      } catch (error) {
        request.log.error({ error }, "Trade slot validation failed");
        return reply.code(500).send({ error: "Failed to validate trade" });
      }
    },
  );

  // Trade impact analysis
  app.post(
    "/api/leagues/:leagueId/teams/:teamId/trades/impact",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string; teamId: string };
        Body: unknown;
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);

      // Normalize incoming payload — accept canonical givePlayers/receivePlayers
      // or legacy playersGiven/playersReceived, with or without { trade: ... } envelope.
      const body = request.body as Record<string, unknown> | null | undefined;
      const src =
        (body?.trade &&
        typeof body.trade === "object" &&
        !Array.isArray(body.trade)
          ? (body.trade as Record<string, unknown>)
          : body) ?? {};
      const give = src.givePlayers ?? src.playersGiven;
      const receive = src.receivePlayers ?? src.playersReceived;

      if (
        !Array.isArray(give) ||
        !Array.isArray(receive) ||
        give.length === 0 ||
        receive.length === 0
      ) {
        return reply.code(400).send({
          error:
            "Invalid trade format. Must include givePlayers and receivePlayers.",
        });
      }

      const trade: ProposedTrade = {
        givePlayers:
          give as import("../agents/trade-recommendation.js").TradePlayer[],
        receivePlayers:
          receive as import("../agents/trade-recommendation.js").TradePlayer[],
      };

      // Resolve snapshotDate
      const snapshotDate = body?.snapshotDate as string | undefined;
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

      const tradeAgent = app.container.agents.tradeRecommendation(
        db,
        request.log,
      );

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

      const tradeAgent = app.container.agents.tradeRecommendation(
        db,
        request.log,
      );

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
