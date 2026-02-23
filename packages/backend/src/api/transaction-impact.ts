import type { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { authenticate, requireLeagueAccess } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/auth.js";
import { TransactionImpactAgent } from "../agents/transaction-impact.js";

/**
 * Transaction Impact API Routes
 * Per Phase 9 PLAN.md
 */

export async function transactionImpactRoutes(app: FastifyInstance) {
  const db = getDb();

  /**
   * POST /api/leagues/:leagueId/transaction-impacts/compute
   * Admin endpoint — triggers roster move derivation + impact computation.
   * Idempotent (deletes + re-derives on each run).
   */
  app.post<{
    Params: { leagueId: string };
    Querystring: { season?: string };
  }>(
    "/api/leagues/:leagueId/transaction-impacts/compute",
    {
      onRequest: [requireAdmin],
    },
    async (request) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const season = request.query.season ? parseInt(request.query.season, 10) : 2025;

      const agent = new TransactionImpactAgent(db, request.log as any);

      // Step 1: Derive roster moves
      const totalMoves = await agent.deriveRosterMoves(leagueId, season);

      // Step 2: Compute impacts
      const impactsComputed = await agent.computeImpacts(leagueId, season);

      return {
        success: true,
        season,
        totalMoves,
        impactsComputed,
      };
    },
  );

  /**
   * GET /api/leagues/:leagueId/teams/:teamId/transaction-impacts
   * Returns all moves for a team with impact scores, sorted by impact.
   */
  app.get<{
    Params: { leagueId: string; teamId: string };
    Querystring: { season?: string; sortBy?: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/transaction-impacts",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const season = request.query.season ? parseInt(request.query.season, 10) : 2025;
      const sortBy = request.query.sortBy || "impact";

      const startDate = `${season}-04-01`;
      const endDate = `${season}-10-31`;

      // Get impacts with player names
      const impacts = await db
        .selectFrom("transaction_impact as ti")
        .leftJoin("player as pg", "pg.id", "ti.player_gained_id")
        .leftJoin("player as pl", "pl.id", "ti.player_lost_id")
        .select([
          "ti.id",
          "ti.move_type",
          "ti.effective_date",
          "ti.impact_roto_points",
          "ti.category_impacts",
          "ti.gained_components",
          "ti.lost_components",
          "ti.is_incomplete",
          "ti.player_gained_id",
          "ti.player_lost_id",
          "pg.name as gained_player_name",
          "pg.positions as gained_player_positions",
          "pl.name as lost_player_name",
          "pl.positions as lost_player_positions",
        ])
        .where("ti.league_id", "=", leagueId)
        .where("ti.team_id", "=", teamId)
        .where("ti.effective_date", ">=", startDate)
        .where("ti.effective_date", "<=", endDate)
        .orderBy(
          sortBy === "date" ? "ti.effective_date" : "ti.impact_roto_points",
          sortBy === "date" ? "asc" : "desc",
        )
        .execute();

      // Compute summary
      const sumOfIndividualImpacts = impacts.reduce((sum, i) => sum + Number(i.impact_roto_points), 0);
      const avgImpactPerMove = impacts.length > 0 ? sumOfIndividualImpacts / impacts.length : 0;
      const bestMove = impacts.length > 0 ? impacts[0] : null;
      const worstMove = impacts.length > 0 ? impacts[impacts.length - 1] : null;

      // Compute Net Roster Management Value
      const agent = new TransactionImpactAgent(db, request.log as any);
      const netResult = await agent.computeNetRosterValue(leagueId, season, teamId);

      return {
        impacts: impacts.map((i) => ({
          id: i.id,
          moveType: i.move_type,
          effectiveDate: i.effective_date,
          impactRotoPoints: Number(i.impact_roto_points),
          playerGained: i.player_gained_id
            ? { id: i.player_gained_id, name: i.gained_player_name, positions: i.gained_player_positions }
            : null,
          playerLost: i.player_lost_id
            ? { id: i.player_lost_id, name: i.lost_player_name, positions: i.lost_player_positions }
            : null,
          categoryImpacts: i.category_impacts,
          isIncomplete: i.is_incomplete,
        })),
        summary: {
          totalMoves: impacts.length,
          netRosterValue: netResult?.netRosterValue ?? null,
          actualRotoPoints: netResult?.actualRotoPoints ?? null,
          draftOnlyRotoPoints: netResult?.draftOnlyRotoPoints ?? null,
          avgImpactPerMove: Math.round(avgImpactPerMove * 100) / 100,
          sumOfIndividualImpacts: Math.round(sumOfIndividualImpacts * 100) / 100,
          bestMove: bestMove
            ? { playerName: bestMove.gained_player_name, impact: Number(bestMove.impact_roto_points) }
            : null,
          worstMove: worstMove
            ? { playerName: worstMove.gained_player_name, impact: Number(worstMove.impact_roto_points) }
            : null,
        },
      };
    },
  );

  /**
   * GET /api/leagues/:leagueId/teams/:teamId/draft-report
   * Returns each draft pick's season contribution and roto-points value.
   */
  app.get<{
    Params: { leagueId: string; teamId: string };
    Querystring: { season?: string };
  }>(
    "/api/leagues/:leagueId/teams/:teamId/draft-report",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const teamId = parseInt(request.params.teamId, 10);
      const season = request.query.season ? parseInt(request.query.season, 10) : 2025;

      const startDate = `${season}-04-01`;
      const endDate = `${season}-10-31`;

      // Get draft pick impacts
      const draftPicks = await db
        .selectFrom("transaction_impact as ti")
        .leftJoin("player as pg", "pg.id", "ti.player_gained_id")
        .select([
          "ti.id",
          "ti.effective_date",
          "ti.impact_roto_points",
          "ti.category_impacts",
          "ti.gained_components",
          "ti.is_incomplete",
          "ti.player_gained_id",
          "pg.name as player_name",
          "pg.positions as positions",
        ])
        .where("ti.league_id", "=", leagueId)
        .where("ti.team_id", "=", teamId)
        .where("ti.move_type", "=", "draft")
        .where("ti.effective_date", ">=", startDate)
        .where("ti.effective_date", "<=", endDate)
        .orderBy("ti.impact_roto_points", "desc")
        .execute();

      // Check if each draft pick is still on the team (final roster snapshot)
      const finalRoster = await db
        .selectFrom("team_roster_snapshot")
        .select("player_id")
        .where("league_id", "=", leagueId)
        .where("team_id", "=", teamId)
        .where("snapshot_date", "=", (qb) =>
          qb
            .selectFrom("team_roster_snapshot")
            .select(db.fn.max("snapshot_date").as("max_date"))
            .where("league_id", "=", leagueId)
            .where("team_id", "=", teamId)
            .where("snapshot_date", ">=", startDate)
            .where("snapshot_date", "<=", endDate),
        )
        .execute();

      const finalPlayerIds = new Set(finalRoster.map((r) => r.player_id));

      const totalDraftValue = draftPicks.reduce((sum, d) => sum + Number(d.impact_roto_points), 0);

      return {
        draftPicks: draftPicks.map((d) => ({
          playerId: d.player_gained_id,
          playerName: d.player_name,
          positions: d.positions,
          impactRotoPoints: Number(d.impact_roto_points),
          categoryImpacts: d.category_impacts,
          keyStats: d.gained_components,
          stillOnTeam: d.player_gained_id ? finalPlayerIds.has(d.player_gained_id) : false,
          isIncomplete: d.is_incomplete,
        })),
        summary: {
          totalPicks: draftPicks.length,
          totalDraftValue: Math.round(totalDraftValue * 100) / 100,
          bestPick: draftPicks.length > 0
            ? { playerName: draftPicks[0].player_name, impact: Number(draftPicks[0].impact_roto_points) }
            : null,
          worstPick: draftPicks.length > 0
            ? {
              playerName: draftPicks[draftPicks.length - 1].player_name,
              impact: Number(draftPicks[draftPicks.length - 1].impact_roto_points),
            }
            : null,
        },
      };
    },
  );
}
