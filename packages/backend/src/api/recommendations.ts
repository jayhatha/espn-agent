import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/connection.js";
import { WaiverRecommendationAgent } from "../agents/waiver-recommendation.js";
import { StandingsProjectionAgent } from "../agents/standings-projection.js";
import { TradeRecommendationAgent, type ProposedTrade } from "../agents/trade-recommendation.js";
import { ESPNAdapter } from "../adapters/espn.js";

/**
 * Recommendations API Routes
 * Per DESIGN_DOC.md §9.3
 */

export async function recommendationsRoutes(app: FastifyInstance) {
  const db = getDb();

  // List available free agents
  app.get(
    "/api/leagues/:leagueId/free-agents",
    async (
      request: FastifyRequest<{
        Params: { leagueId: string };
        Querystring: { snapshotDate?: string; limit?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { snapshotDate, limit } = request.query;
      const maxPlayers = limit ? parseInt(limit, 10) : 100;

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
        // Get latest ESPN payload to extract free agents
        const latestPayload = await db
          .selectFrom("league_raw_payload")
          .select("response_json")
          .where("league_id", "=", leagueId)
          .orderBy("fetched_at", "desc")
          .executeTakeFirst();

        if (!latestPayload) {
          return reply.code(404).send({ error: "No league data found" });
        }

        const espnAdapter = new ESPNAdapter(request.log);
        const normalized = espnAdapter.normalizeLeagueData(
          latestPayload.response_json as Record<string, unknown>,
        );

        const espnPlayerIds = normalized.freeAgents?.map((fa) => fa.playerId) || [];

        if (espnPlayerIds.length === 0) {
          return { freeAgents: [], snapshotDate: date };
        }

        // Get player details and projections
        const snapshot = await db
          .selectFrom("league_daily_snapshot")
          .selectAll()
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", date)
          .executeTakeFirst();

        const freeAgents = await db
          .selectFrom("player as p")
          .select([
            "p.id as player_id",
            "p.name as player_name",
            "p.mlb_team",
            "p.positions",
          ])
          .where("p.id", "in", espnPlayerIds.slice(0, maxPlayers))
          .orderBy("p.name", "asc")
          .execute();

        // Enrich with projections if available
        if (snapshot?.projections_run_id && freeAgents.length > 0) {
          const playerIds = freeAgents.map((fa) => fa.player_id);
          const projections = await db
            .selectFrom("player_projection")
            .select(["player_id", "stat_components_json"])
            .where("projections_run_id", "=", snapshot.projections_run_id)
            .where("player_id", "in", playerIds)
            .execute();

          const projMap = new Map(
            projections.map((p) => [p.player_id, p.stat_components_json]),
          );

          const enriched = freeAgents.map((fa) => ({
            playerId: fa.player_id,
            espnPlayerId: fa.player_id,
            playerName: fa.player_name,
            mlbTeam: fa.mlb_team,
            positions: fa.positions,
            projections: projMap.get(fa.player_id) || null,
          }));

          return { freeAgents: enriched, snapshotDate: date };
        }

        const enriched = freeAgents.map((fa) => ({
          playerId: fa.player_id,
          espnPlayerId: fa.player_id,
          playerName: fa.player_name,
          mlbTeam: fa.mlb_team,
          positions: fa.positions,
          projections: null,
        }));

        return { freeAgents: enriched, snapshotDate: date };
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
                .innerJoin("projections_run as run", "proj.projections_run_id", "run.id")
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
        const tenureRows =
          playerIds.length > 0
            ? await db
                .selectFrom("player_period_stats")
                .select(["player_id", "components_json"])
                .where("league_id", "=", leagueId)
                .where("team_id", "=", teamId)
                .where("player_id", "in", playerIds)
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
          tenureStats: tenureMap.get(player.player_id) || null,
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
        Body: { addPlayerId: number; dropPlayerId: number; snapshotDate?: string };
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
        const espnAdapter = new ESPNAdapter(request.log);
        const standingsAgent = new StandingsProjectionAgent(db, request.log);
        const waiverAgent = new WaiverRecommendationAgent(
          db,
          standingsAgent,
          espnAdapter,
          request.log,
        );

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
            error: "No projected standings found. Please upload projections and run a snapshot first.",
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
          (r) => r.addPlayerId === addPlayerId && r.dropPlayerId === dropPlayerId,
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
            explanation: "This swap would not improve your projected standings.",
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

      const espnAdapter = new ESPNAdapter(request.log);
      const standingsAgent = new StandingsProjectionAgent(db, request.log);
      const waiverAgent = new WaiverRecommendationAgent(
        db,
        standingsAgent,
        espnAdapter,
        request.log,
      );

      const recommendations = await waiverAgent.getRecommendations(
        leagueId,
        teamId,
        date,
        {
          maxRecommendations: maxRecommendations
            ? parseInt(maxRecommendations, 10)
            : 10,
        },
      );

      return { recommendations, snapshotDate: date };
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
          error: "Invalid trade format. Must include givePlayers and receivePlayers.",
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

      const tradeAgent = new TradeRecommendationAgent(db, request.log);

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

      const tradeAgent = new TradeRecommendationAgent(db, request.log);

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
        // Get team info
        const [userTeam, partnerTeam] = await Promise.all([
          db
            .selectFrom("team")
            .selectAll()
            .where("league_id", "=", leagueId)
            .where("id", "=", teamId)
            .executeTakeFirst(),
          db
            .selectFrom("team")
            .selectAll()
            .where("league_id", "=", leagueId)
            .where("id", "=", partnerTeamId)
            .executeTakeFirst(),
        ]);

        if (!userTeam || !partnerTeam) {
          return reply.code(404).send({ error: "Team not found" });
        }

        // Get rosters for both teams
        const [userRoster, partnerRoster] = await Promise.all([
          db
            .selectFrom("team_roster_snapshot as roster")
            .innerJoin("player", "roster.player_id", "player.id")
            .select([
              "roster.player_id",
              "player.name as player_name",
              "player.mlb_team",
              "player.positions",
              "roster.roster_status",
              "roster.roster_slot",
            ])
            .where("roster.league_id", "=", leagueId)
            .where("roster.team_id", "=", teamId)
            .where("roster.snapshot_date", "=", date)
            .where("roster.roster_status", "in", ["active", "bench"])
            .orderBy("player.name", "asc")
            .execute(),
          db
            .selectFrom("team_roster_snapshot as roster")
            .innerJoin("player", "roster.player_id", "player.id")
            .select([
              "roster.player_id",
              "player.name as player_name",
              "player.mlb_team",
              "player.positions",
              "roster.roster_status",
              "roster.roster_slot",
            ])
            .where("roster.league_id", "=", leagueId)
            .where("roster.team_id", "=", partnerTeamId)
            .where("roster.snapshot_date", "=", date)
            .where("roster.roster_status", "in", ["active", "bench"])
            .orderBy("player.name", "asc")
            .execute(),
        ]);

        // Get projections for all players involved
        const allPlayerIds = [
          ...userRoster.map((p) => p.player_id),
          ...partnerRoster.map((p) => p.player_id),
        ];

        const projections =
          allPlayerIds.length > 0
            ? await db
                .selectFrom("player_projection as proj")
                .innerJoin("projections_run as run", "proj.projections_run_id", "run.id")
                .select([
                  "proj.player_id",
                  "proj.stat_components_json",
                  "run.as_of_date",
                ])
                .where("run.as_of_date", "<=", date)
                .where("proj.player_id", "in", allPlayerIds)
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

        // Enrich rosters with projection data
        const enrichedUserRoster = userRoster.map((player) => ({
          playerId: player.player_id,
          espnPlayerId: player.player_id,
          playerName: player.player_name,
          mlbTeam: player.mlb_team,
          positions: player.positions,
          rosterStatus: player.roster_status,
          rosterSlot: player.roster_slot,
          projections: projectionMap.get(player.player_id) || null,
        }));

        const enrichedPartnerRoster = partnerRoster.map((player) => ({
          playerId: player.player_id,
          espnPlayerId: player.player_id,
          playerName: player.player_name,
          mlbTeam: player.mlb_team,
          positions: player.positions,
          rosterStatus: player.roster_status,
          rosterSlot: player.roster_slot,
          projections: projectionMap.get(player.player_id) || null,
        }));

        return {
          snapshotDate: date,
          userTeam: {
            id: userTeam.id,
            name: userTeam.name,
            roster: enrichedUserRoster,
          },
          partnerTeam: {
            id: partnerTeam.id,
            name: partnerTeam.name,
            roster: enrichedPartnerRoster,
          },
        };
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
