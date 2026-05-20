import type { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import {
  authenticate,
  requireAdmin,
  requireLeagueAccess,
} from "../middleware/auth.js";

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
      onRequest: [authenticate, requireAdmin],
    },
    async (request) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const season = request.query.season
        ? parseInt(request.query.season, 10)
        : new Date().getFullYear();

      const agent = app.container.agents.transactionImpact(db, request.log);

      // Step 1: Derive roster moves
      const totalMoves = await agent.deriveRosterMoves(leagueId, season);

      // Step 2: Compute Shapley impacts (includes CI from Monte Carlo sampling variance)
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
      const season = request.query.season
        ? parseInt(request.query.season, 10)
        : new Date().getFullYear();
      const sortBy = request.query.sortBy || "impact";

      const startDate = `${season}-01-01`;
      const endDate = `${season}-12-31`;

      // Get impacts with player names
      const impacts: any[] = await db
        .selectFrom("transaction_impact as ti")
        .leftJoin("player as pg", "pg.id", "ti.player_gained_id")
        .leftJoin("player as pl", "pl.id", "ti.player_lost_id")
        .select([
          "ti.id",
          "ti.move_type",
          "ti.effective_date",
          "ti.impact_roto_points",
          "ti.shapley_impact",
          "ti.ci_low",
          "ti.ci_high",
          "ti.is_uncertain",
          "ti.sgp_category_impacts",
          "ti.replacement_level_impact",
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
        ] as any)
        .where("ti.league_id", "=", leagueId)
        .where("ti.team_id", "=", teamId)
        .where("ti.effective_date", ">=", startDate)
        .where("ti.effective_date", "<=", endDate)
        .orderBy(
          sortBy === "impact"
            ? (qb: any) =>
                qb.fn.coalesce("ti.shapley_impact", "ti.impact_roto_points")
            : "ti.effective_date",
          sortBy === "date" ? "asc" : "desc",
        )
        .execute();

      // Helper to get primary impact (Shapley if available, else legacy)
      const primaryImpact = (i: any) =>
        i.shapley_impact != null
          ? Number(i.shapley_impact)
          : Number(i.impact_roto_points);

      // Compute summary
      const sumOfIndividualImpacts = impacts.reduce(
        (sum, i) => sum + primaryImpact(i),
        0,
      );
      const avgImpactPerMove =
        impacts.length > 0 ? sumOfIndividualImpacts / impacts.length : 0;
      const bestMove = impacts.length > 0 ? impacts[0] : null;
      const worstMove = impacts.length > 0 ? impacts[impacts.length - 1] : null;

      // Compute Net Roster Management Value
      const agent = app.container.agents.transactionImpact(db, request.log);
      const netResult = await agent.computeNetRosterValue(
        leagueId,
        season,
        teamId,
      );

      return {
        impacts: impacts.map((i) => ({
          id: i.id,
          moveType: i.move_type,
          effectiveDate: i.effective_date,
          impactRotoPoints: Number(i.impact_roto_points),
          shapleyImpact: i.shapley_impact ? Number(i.shapley_impact) : null,
          ciLow: i.ci_low ? Number(i.ci_low) : null,
          ciHigh: i.ci_high ? Number(i.ci_high) : null,
          isUncertain: i.is_uncertain ?? false,
          sgpCategoryImpacts: i.sgp_category_impacts,
          replacementLevelImpact: i.replacement_level_impact
            ? Number(i.replacement_level_impact)
            : null,
          playerGained: i.player_gained_id
            ? {
                id: i.player_gained_id,
                name: i.gained_player_name,
                positions: i.gained_player_positions,
              }
            : null,
          playerLost: i.player_lost_id
            ? {
                id: i.player_lost_id,
                name: i.lost_player_name,
                positions: i.lost_player_positions,
              }
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
          sumOfIndividualImpacts:
            Math.round(sumOfIndividualImpacts * 100) / 100,
          bestMove: bestMove
            ? {
                playerName: bestMove.gained_player_name,
                impact: primaryImpact(bestMove),
              }
            : null,
          worstMove: worstMove
            ? {
                playerName: worstMove.gained_player_name,
                impact: primaryImpact(worstMove),
              }
            : null,
        },
      };
    },
  );

  /**
   * GET /api/leagues/:leagueId/transaction-impacts/league-summary
   * Returns best/worst moves across all teams, plus per-team roster management rankings.
   */
  app.get<{
    Params: { leagueId: string };
    Querystring: { season?: string; limit?: string };
  }>(
    "/api/leagues/:leagueId/transaction-impacts/league-summary",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const season = request.query.season
        ? parseInt(request.query.season, 10)
        : new Date().getFullYear();
      const limit = request.query.limit
        ? parseInt(request.query.limit, 10)
        : 10;

      const startDate = `${season}-01-01`;
      const endDate = `${season}-12-31`;

      // All impacts across every team, sorted by impact desc
      const allImpacts: any[] = await db
        .selectFrom("transaction_impact as ti")
        .innerJoin("team as t", (join) =>
          join
            .onRef("t.id", "=", "ti.team_id")
            .on("t.league_id", "=", leagueId),
        )
        .leftJoin("player as pg", "pg.id", "ti.player_gained_id")
        .leftJoin("player as pl", "pl.id", "ti.player_lost_id")
        .select([
          "ti.id",
          "ti.team_id",
          "t.name as team_name",
          "ti.move_type",
          "ti.effective_date",
          "ti.impact_roto_points",
          "ti.shapley_impact",
          "ti.ci_low",
          "ti.ci_high",
          "ti.is_uncertain",
          "ti.is_incomplete",
          "ti.player_gained_id",
          "ti.player_lost_id",
          "pg.name as gained_player_name",
          "pg.positions as gained_player_positions",
          "pl.name as lost_player_name",
          "pl.positions as lost_player_positions",
        ] as any)
        .where("ti.league_id", "=", leagueId)
        .where("ti.effective_date", ">=", startDate)
        .where("ti.effective_date", "<=", endDate)
        .where("ti.move_type", "!=", "draft")
        .orderBy(
          (qb: any) =>
            qb.fn.coalesce("ti.shapley_impact", "ti.impact_roto_points"),
          "desc",
        )
        .execute();

      const primaryImpact = (i: any) =>
        i.shapley_impact != null
          ? Number(i.shapley_impact)
          : Number(i.impact_roto_points);

      const formatMove = (i: any) => ({
        id: i.id,
        teamId: i.team_id,
        teamName: i.team_name,
        moveType: i.move_type,
        effectiveDate: i.effective_date,
        impact: Math.round(primaryImpact(i) * 100) / 100,
        isUncertain: i.is_uncertain ?? false,
        ciLow: i.ci_low ? Number(i.ci_low) : null,
        ciHigh: i.ci_high ? Number(i.ci_high) : null,
        isIncomplete: i.is_incomplete,
        playerGained: i.player_gained_id
          ? {
              id: i.player_gained_id,
              name: i.gained_player_name,
              positions: i.gained_player_positions,
            }
          : null,
        playerLost: i.player_lost_id
          ? {
              id: i.player_lost_id,
              name: i.lost_player_name,
              positions: i.lost_player_positions,
            }
          : null,
      });

      const bestMoves = allImpacts.slice(0, limit).map(formatMove);
      const worstMoves = allImpacts.slice(-limit).reverse().map(formatMove);

      // Per-team roster management summary
      const teamMap = new Map<
        number,
        { name: string; totalImpact: number; moveCount: number }
      >();
      for (const i of allImpacts) {
        const existing = teamMap.get(i.team_id);
        if (existing) {
          existing.totalImpact += primaryImpact(i);
          existing.moveCount++;
        } else {
          teamMap.set(i.team_id, {
            name: i.team_name,
            totalImpact: primaryImpact(i),
            moveCount: 1,
          });
        }
      }

      // Compute net roster value for each team
      const agent = app.container.agents.transactionImpact(db, request.log);
      const teamRankings: Array<{
        teamId: number;
        teamName: string;
        moveCount: number;
        netRosterValue: number | null;
        actualRotoPoints: number | null;
        draftOnlyRotoPoints: number | null;
        sumOfImpacts: number;
      }> = [];

      for (const [teamId, data] of teamMap) {
        const netResult = await agent.computeNetRosterValue(
          leagueId,
          season,
          teamId,
        );
        teamRankings.push({
          teamId,
          teamName: data.name,
          moveCount: data.moveCount,
          netRosterValue: netResult
            ? Math.round(netResult.netRosterValue * 100) / 100
            : null,
          actualRotoPoints: netResult
            ? Math.round(netResult.actualRotoPoints * 100) / 100
            : null,
          draftOnlyRotoPoints: netResult
            ? Math.round(netResult.draftOnlyRotoPoints * 100) / 100
            : null,
          sumOfImpacts: Math.round(data.totalImpact * 100) / 100,
        });
      }

      teamRankings.sort(
        (a, b) =>
          (b.netRosterValue ?? b.sumOfImpacts) -
          (a.netRosterValue ?? a.sumOfImpacts),
      );

      // Build trade packages: group trade legs by team+date
      const tradeImpacts = allImpacts.filter((i) => i.move_type === "trade");
      const tradePackageMap = new Map<string, typeof tradeImpacts>();
      for (const t of tradeImpacts) {
        const key = `${t.team_id}-${t.effective_date}`;
        if (!tradePackageMap.has(key)) tradePackageMap.set(key, []);
        tradePackageMap.get(key)!.push(t);
      }

      const tradePackages = Array.from(tradePackageMap.entries()).map(
        ([, legs]) => {
          const totalImpact = legs.reduce((s, l) => s + primaryImpact(l), 0);
          return {
            teamId: legs[0].team_id,
            teamName: legs[0].team_name,
            effectiveDate: legs[0].effective_date,
            totalImpact: Math.round(totalImpact * 100) / 100,
            playersGained: legs
              .filter((l) => l.player_gained_id)
              .map((l) => ({
                id: l.player_gained_id,
                name: l.gained_player_name,
                positions: l.gained_player_positions,
              })),
            playersLost: legs
              .filter((l) => l.player_lost_id)
              .map((l) => ({
                id: l.player_lost_id,
                name: l.lost_player_name,
                positions: l.lost_player_positions,
              })),
            legs: legs.map(formatMove),
          };
        },
      );

      tradePackages.sort((a, b) => b.totalImpact - a.totalImpact);
      const bestTrades = tradePackages.slice(0, limit);
      const worstTrades = tradePackages.slice(-limit).reverse();

      return {
        season,
        bestMoves,
        worstMoves,
        bestTrades,
        worstTrades,
        teamRankings,
        totalMovesLeagueWide: allImpacts.length,
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
      const season = request.query.season
        ? parseInt(request.query.season, 10)
        : new Date().getFullYear();

      const startDate = `${season}-01-01`;
      const endDate = `${season}-12-31`;

      // Get draft pick impacts
      const draftPicks: any[] = await db
        .selectFrom("transaction_impact as ti")
        .leftJoin("player as pg", "pg.id", "ti.player_gained_id")
        .select([
          "ti.id",
          "ti.effective_date",
          "ti.impact_roto_points",
          "ti.shapley_impact",
          "ti.ci_low",
          "ti.ci_high",
          "ti.is_uncertain",
          "ti.sgp_category_impacts",
          "ti.replacement_level_impact",
          "ti.replacement_level_components",
          "ti.category_impacts",
          "ti.gained_components",
          "ti.is_incomplete",
          "ti.player_gained_id",
          "pg.name as player_name",
          "pg.positions as positions",
        ] as any)
        .where("ti.league_id", "=", leagueId)
        .where("ti.team_id", "=", teamId)
        .where("ti.move_type", "=", "draft")
        .where("ti.effective_date", ">=", startDate)
        .where("ti.effective_date", "<=", endDate)
        .orderBy(
          (qb: any) =>
            qb.fn.coalesce("ti.shapley_impact", "ti.impact_roto_points"),
          "desc",
        )
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

      // Helper to get primary impact
      const primaryImpact = (d: any) =>
        d.shapley_impact != null
          ? Number(d.shapley_impact)
          : Number(d.impact_roto_points);

      const totalDraftValue = draftPicks.reduce(
        (sum, d) => sum + primaryImpact(d),
        0,
      );

      return {
        draftPicks: draftPicks.map((d) => ({
          playerId: d.player_gained_id,
          playerName: d.player_name,
          positions: d.positions,
          impactRotoPoints: Number(d.impact_roto_points),
          shapleyImpact: d.shapley_impact ? Number(d.shapley_impact) : null,
          replacementLevelImpact: d.replacement_level_impact
            ? Number(d.replacement_level_impact)
            : null,
          ciLow: d.ci_low ? Number(d.ci_low) : null,
          ciHigh: d.ci_high ? Number(d.ci_high) : null,
          isUncertain: d.is_uncertain ?? false,
          sgpCategoryImpacts: d.sgp_category_impacts,
          categoryImpacts: d.category_impacts,
          keyStats: d.gained_components,
          stillOnTeam: d.player_gained_id
            ? finalPlayerIds.has(d.player_gained_id)
            : false,
          isIncomplete: d.is_incomplete,
        })),
        summary: {
          totalPicks: draftPicks.length,
          totalDraftValue: Math.round(totalDraftValue * 100) / 100,
          bestPick:
            draftPicks.length > 0
              ? {
                  playerName: draftPicks[0].player_name,
                  impact: primaryImpact(draftPicks[0]),
                }
              : null,
          worstPick:
            draftPicks.length > 0
              ? {
                  playerName: draftPicks[draftPicks.length - 1].player_name,
                  impact: primaryImpact(draftPicks[draftPicks.length - 1]),
                }
              : null,
        },
      };
    },
  );
}
