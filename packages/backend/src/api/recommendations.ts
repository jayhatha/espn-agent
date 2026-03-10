import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { getDb } from "../db/connection.js";
import { WaiverRecommendationAgent } from "../agents/waiver-recommendation.js";
import { StandingsProjectionAgent } from "../agents/standings-projection.js";
import { TradeRecommendationAgent, type ProposedTrade } from "../agents/trade-recommendation.js";
import { DraftRankingsAgent } from "../agents/draft-rankings.js";
import { ESPNAdapter } from "../adapters/espn.js";
import { authenticate, requireLeagueAccess, requireTeamOwnership } from "../middleware/auth.js";
import { decryptToken, hasEncryptionKey } from "../utils/encryption.js";

/**
 * Recommendations API Routes
 * Per DESIGN_DOC.md §9.3
 */

export async function recommendationsRoutes(app: FastifyInstance) {
  const db = getDb();

  // List available free agents
  app.get<{
    Params: { leagueId: string };
    Querystring: { snapshotDate?: string; limit?: string; sortBy?: string; position?: string };
  }>(
    "/api/leagues/:leagueId/free-agents",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { snapshotDate, limit, sortBy, position } = request.query;
      const maxPlayers = limit ? parseInt(limit, 10) : 200;
      const positionFilter = position?.split(",").map((p) => p.trim()).filter(Boolean) || [];

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
        // Fetch league auth info
        const league = await db
          .selectFrom("league")
          .select(["espn_league_id", "season", "espn_swid_encrypted", "espn_s2_encrypted"])
          .where("id", "=", leagueId)
          .executeTakeFirst();

        if (!league) {
          return reply.code(404).send({ error: "League not found" });
        }

        // Decrypt ESPN cookies (encrypted only)
        let auth: { SWID: string; espn_s2: string } | undefined;
        if (league.espn_swid_encrypted && league.espn_s2_encrypted) {
          if (!hasEncryptionKey()) {
            return reply.code(500).send({ error: "ENCRYPTION_KEY not configured - cannot decrypt credentials" });
          }
          try {
            auth = {
              SWID: decryptToken(league.espn_swid_encrypted),
              espn_s2: decryptToken(league.espn_s2_encrypted),
            };
          } catch (error) {
            request.log.error({ error }, "Failed to decrypt ESPN cookies");
            return reply.code(500).send({ error: "Failed to decrypt ESPN credentials" });
          }
        }

        // Fetch free agents live from ESPN with ownership data
        const espnAdapter = new ESPNAdapter(request.log as any);
        let espnFreeAgents = await espnAdapter.fetchFreeAgents({
          leagueId: league.espn_league_id,
          season: league.season,
          auth,
          limit: maxPlayers,
        });

        if (espnFreeAgents.length === 0) {
          return { freeAgents: [], snapshotDate: date };
        }

        // Apply position filter if specified
        if (positionFilter.length > 0) {
          espnFreeAgents = espnFreeAgents.filter((fa) =>
            fa.positions.some((pos) => positionFilter.includes(pos))
          );
        }

        // Build a map of ESPN player ID → ownership data
        const ownershipMap = new Map(
          espnFreeAgents.map((fa) => [fa.playerId, { pctOwned: fa.pctOwned, pctStarted: fa.pctStarted }])
        );

        const espnPlayerIds = espnFreeAgents.map((fa) => fa.playerId);

        // Upsert free agent players into the player table in a single batch insert
        if (espnFreeAgents.length > 0) {
          const playerRows = espnFreeAgents.map(fa => ({
            id: fa.playerId,
            name: fa.name,
            mlb_team: fa.mlbTeam,
            positions: fa.positions,
            created_at: new Date(),
          }));

          await db
            .insertInto("player")
            .values(playerRows)
            .onConflict((oc) =>
              oc.column("id").doUpdateSet({
                name: sql`excluded.name`,
                mlb_team: sql`excluded.mlb_team`,
                positions: sql`excluded.positions`,
              }),
            )
            .execute();
        }

        // Get player DB IDs
        const freeAgents = espnPlayerIds.length > 0
          ? await db
              .selectFrom("player as p")
              .select([
                "p.id as player_id",
                "p.id as espn_player_id",
                "p.name as player_name",
                "p.mlb_team",
                "p.positions",
              ])
              .where("p.id", "in", espnPlayerIds)
              .execute()
          : [];

        // Get projections if available
        const snapshot = await db
          .selectFrom("league_daily_snapshot")
          .selectAll()
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", date)
          .executeTakeFirst();

        const projMap = new Map<number, Record<string, unknown>>();
        if (snapshot?.projections_run_id && freeAgents.length > 0) {
          const playerIds = freeAgents.map((fa) => fa.player_id);
          const projections = playerIds.length > 0
            ? await db
                .selectFrom("player_projection")
                .select(["player_id", "stat_components_json"])
                .where("projections_run_id", "=", snapshot.projections_run_id)
                .where("player_id", "in", playerIds)
                .execute()
            : [];

          for (const p of projections) {
            projMap.set(p.player_id, p.stat_components_json as Record<string, unknown>);
          }
        }

        let enriched = freeAgents.map((fa) => {
          const ownership = ownershipMap.get(fa.espn_player_id);
          return {
            playerId: fa.player_id,
            espnPlayerId: fa.espn_player_id,
            playerName: fa.player_name,
            mlbTeam: fa.mlb_team,
            positions: fa.positions,
            projections: projMap.get(fa.player_id) || null,
            pctOwned: ownership?.pctOwned ?? 0,
          };
        });

        // Apply sorting
        if (sortBy === "pct_owned" || !sortBy) {
          enriched.sort((a, b) => b.pctOwned - a.pctOwned);
        } else if (sortBy === "name") {
          enriched.sort((a, b) => a.playerName.localeCompare(b.playerName));
        }

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
  app.get<{
    Params: { leagueId: string; teamId: string };
    Querystring: { snapshotDate?: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/roster",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
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
            "player.id as espn_player_id",
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
          .execute();

        // Get projections for all players
        const playerIds = roster.map((p) => p.player_id);

        const projections =
          playerIds.length > 0
            ? await db
                .selectFrom("player_projection as proj")
                .innerJoin("projections_run as run", "run.id", "proj.projections_run_id")
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

        // Enrich roster with projection data
        const enrichedRoster = roster.map((player) => ({
          playerId: player.player_id,
          espnPlayerId: player.espn_player_id,
          playerName: player.player_name,
          mlbTeam: player.mlb_team,
          positions: player.positions,
          rosterStatus: player.roster_status,
          rosterSlot: player.roster_slot,
          projections: projectionMap.get(player.player_id) || null,
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
  app.post<{
    Params: { leagueId: string; teamId: string };
    Body: { addPlayerId: number; dropPlayerId: number; snapshotDate?: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/waivers/evaluate",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
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
        const espnAdapter = new ESPNAdapter(request.log as any);
        const standingsAgent = new StandingsProjectionAgent(db, request.log as any);
        const waiverAgent = new WaiverRecommendationAgent(
          db,
          standingsAgent,
          espnAdapter,
          request.log as any,
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
  app.get<{
    Params: { leagueId: string; teamId: string };
    Querystring: { snapshotDate?: string; maxRecommendations?: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/waivers/recommendations",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
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

      const espnAdapter = new ESPNAdapter(request.log as any);
      const standingsAgent = new StandingsProjectionAgent(db, request.log as any);
      const waiverAgent = new WaiverRecommendationAgent(
        db,
        standingsAgent,
        espnAdapter,
        request.log as any,
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

  // Trade validation (lightweight check before expensive simulation)
  app.post<{
    Params: { leagueId: string; teamId: string };
    Body: { givePlayers: number[]; receivePlayers: number[]; snapshotDate?: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/trades/validate",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const { givePlayers, receivePlayers, snapshotDate } = request.body;

      // Validate trade size
      const proposedTrade: ProposedTrade = {
        givePlayers: givePlayers.map((id) => ({ playerId: id, playerName: "" })),
        receivePlayers: receivePlayers.map((id) => ({ playerId: id, playerName: "" })),
      };

      const sizeValidation = TradeRecommendationAgent.validateTradeSize(proposedTrade);
      if (!sizeValidation.valid) {
        return reply.code(400).send({
          error: sizeValidation.error,
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

      // Look up player names
      const allPlayerIds = [...givePlayers, ...receivePlayers];
      const players =
        allPlayerIds.length > 0
          ? await db
              .selectFrom("player")
              .select(["id", "name"])
              .where("id", "in", allPlayerIds)
              .execute()
          : [];

      const playerMap = new Map(players.map((p) => [p.id, p.name]));

      const trade: ProposedTrade = {
        givePlayers: givePlayers.map((id) => ({
          playerId: id,
          playerName: playerMap.get(id) || "Unknown",
        })),
        receivePlayers: receivePlayers.map((id) => ({
          playerId: id,
          playerName: playerMap.get(id) || "Unknown",
        })),
      };

      const tradeAgent = new TradeRecommendationAgent(db, request.log as any);

      try {
        const validation = await tradeAgent.validateRosterSlots(
          leagueId,
          teamId,
          date,
          trade,
        );

        return {
          isLegal: validation.isLegal,
          issues: validation.issues,
          giveCount: givePlayers.length,
          receiveCount: receivePlayers.length,
        };
      } catch (error) {
        request.log.error({ error }, "Trade validation failed");
        return reply.code(500).send({
          error: "Failed to validate trade",
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  );

  // Trade impact analysis
  app.post<{
    Params: { leagueId: string; teamId: string };
    Body: {
      trade?: ProposedTrade;
      givePlayers?: number[];
      receivePlayers?: number[];
      snapshotDate?: string;
    };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/trades/impact",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const { trade: legacyTrade, givePlayers, receivePlayers, snapshotDate } = request.body;

      let trade: ProposedTrade;

      // Support both legacy format and new ID-only format
      if (legacyTrade) {
        trade = legacyTrade;
      } else if (givePlayers && receivePlayers) {
        // Look up player names from DB
        const allPlayerIds = [...givePlayers, ...receivePlayers];
        const players =
          allPlayerIds.length > 0
            ? await db
                .selectFrom("player")
                .select(["id", "name"])
                .where("id", "in", allPlayerIds)
                .execute()
            : [];

        const playerMap = new Map(players.map((p) => [p.id, p.name]));

        trade = {
          givePlayers: givePlayers.map((id) => ({
            playerId: id,
            playerName: playerMap.get(id) || "Unknown",
          })),
          receivePlayers: receivePlayers.map((id) => ({
            playerId: id,
            playerName: playerMap.get(id) || "Unknown",
          })),
        };
      } else {
        return reply.code(400).send({
          error: "Invalid trade format. Must include either 'trade' or 'givePlayers' and 'receivePlayers'.",
        });
      }

      // Validate trade size before expensive simulation
      const sizeValidation = TradeRecommendationAgent.validateTradeSize(trade);
      if (!sizeValidation.valid) {
        return reply.code(400).send({
          error: sizeValidation.error,
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

      const tradeAgent = new TradeRecommendationAgent(db, request.log as any);

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
  app.get<{
    Params: { leagueId: string; teamId: string };
    Querystring: { snapshotDate?: string; maxCandidates?: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/trades/recommendations",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
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

      const tradeAgent = new TradeRecommendationAgent(db, request.log as any);

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
  app.get<{
    Params: {
      leagueId: string;
      teamId: string;
      partnerTeamId: string;
    };
    Querystring: { snapshotDate?: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/trades/partners/:partnerTeamId/rosters",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
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
              "player.id as espn_player_id",
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
              "player.id as espn_player_id",
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
                .innerJoin("projections_run as run", "run.id", "proj.projections_run_id")
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
          espnPlayerId: player.espn_player_id,
          playerName: player.player_name,
          mlbTeam: player.mlb_team,
          positions: player.positions,
          rosterStatus: player.roster_status,
          rosterSlot: player.roster_slot,
          projections: projectionMap.get(player.player_id) || null,
        }));

        const enrichedPartnerRoster = partnerRoster.map((player) => ({
          playerId: player.player_id,
          espnPlayerId: player.espn_player_id,
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
  app.get<{
    Params: { leagueId: string; teamId: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/trades/partners",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess, requireTeamOwnership],
    },
    async (request, reply) => {
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

  // Draft recommendations
  app.get<{
    Params: { leagueId: string };
    Querystring: { limit?: string; position?: string };
  }>(
    "/api/leagues/:leagueId/draft/recommendations",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { limit, position } = request.query;

      try {
        request.log.info({ leagueId }, "Generating draft rankings");

        // Check if fresh projections exist
        const freshProjection = await db
          .selectFrom("projections_run")
          .select("id")
          .where("staleness", "=", "fresh")
          .orderBy("as_of_date", "desc")
          .executeTakeFirst();

        if (!freshProjection) {
          return reply.code(503).send({
            error: "No fresh projections available",
            message: "Draft recommendations require up-to-date projections. Please upload a FanGraphs CSV or wait for projections to refresh.",
            degraded: true,
          });
        }

        // Instantiate agent and generate rankings
        const draftAgent = new DraftRankingsAgent(db);
        const rankings = await draftAgent.getRankings(leagueId, {
          limit: limit ? parseInt(limit, 10) : 300,
          position: position || undefined,
        });

        return {
          rankings,
          projectionsRunId: freshProjection.id,
          total: rankings.length,
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
}
