import type { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { authenticate, requireLeagueAccess } from "../middleware/auth.js";
import { parseIntParam } from "../utils/validation.js";
import { monteCarloRotoPoints } from "../projection/variance.js";
import type { TeamCategoryValue } from "../projection/variance.js";
import { StandingsSwingAttributionAgent } from "../agents/standings-swing-attribution.js";
import {
  changeLogEmitter,
  CHANGE_LOG_EVENT,
  LIVE_POLL_EVENT,
  type LivePollSignal,
} from "../utils/change-log-emitter.js";
import { LivePollAgent } from "../agents/live-poll.js";

/**
 * Time Series API Routes
 * Per DESIGN_DOC.md §9.2
 */

interface TimeSeriesQuery {
  from?: string;
  to?: string;
  teamIds?: string; // comma-separated
  season?: string; // year filter
  limit?: string; // max rows to return (default 1000)
}

export async function timeSeriesRoutes(app: FastifyInstance) {
  const db = getDb();
  const { sql } = await import("kysely");

  /**
   * When no season/from/to filters are provided, default to the league's
   * current season so historical backfill data doesn't pollute graphs.
   */
  async function getDefaultSeason(leagueId: number): Promise<string | null> {
    const league = await db
      .selectFrom("league")
      .select("season")
      .where("id", "=", leagueId)
      .executeTakeFirst();
    return league ? String(league.season) : null;
  }

  // Available seasons for a league
  app.get<{
    Params: { leagueId: string };
  }>(
    "/api/leagues/:leagueId/seasons",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      try {
        const leagueId = parseIntParam(request.params.leagueId, "leagueId");

        const result = await db
          .selectFrom("league_daily_snapshot")
          .select(
            sql<number>`DISTINCT EXTRACT(YEAR FROM snapshot_date::date)::integer`.as(
              "season",
            ),
          )
          .where("league_id", "=", leagueId)
          .orderBy("season", "desc")
          .execute();

        const seasons = result.map((r) => r.season);
        return { seasons };
      } catch (err) {
        return reply
          .code(400)
          .send({
            error: err instanceof Error ? err.message : "Invalid request",
          });
      }
    },
  );

  // Overall standings over time
  app.get<{
    Params: { leagueId: string };
    Querystring: TimeSeriesQuery;
  }>(
    "/api/leagues/:leagueId/timeseries/overall",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    async (request) => {
      const leagueId = parseIntParam(request.params.leagueId, "leagueId");
      const { from, to, teamIds, limit } = request.query;
      // Default to current season if no date filters provided
      const season =
        request.query.season ||
        (!from && !to ? await getDefaultSeason(leagueId) : null);

      let query = db
        .selectFrom("team_daily_overall")
        .selectAll()
        .where("league_id", "=", leagueId);

      if (season) {
        const seasonYear = parseInt(season, 10);
        query = query
          .where("snapshot_date", ">=", `${seasonYear}-01-01`)
          .where("snapshot_date", "<=", `${seasonYear}-12-31`);
      }

      if (from) {
        query = query.where("snapshot_date", ">=", from);
      }
      if (to) {
        query = query.where("snapshot_date", "<=", to);
      }
      if (teamIds) {
        const ids = teamIds.split(",").map((id) => parseInt(id, 10));
        query = query.where("team_id", "in", ids);
      }

      const queryLimit = limit ? parseInt(limit, 10) : 1000;
      const series = await query
        .orderBy("snapshot_date", "asc")
        .limit(queryLimit)
        .execute();

      return { series };
    },
  );

  // Category rank over time
  app.get<{
    Params: { leagueId: string };
    Querystring: TimeSeriesQuery & { categoryId: string };
  }>(
    "/api/leagues/:leagueId/timeseries/category-rank",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseIntParam(request.params.leagueId, "leagueId");
      const { from, to, teamIds, categoryId, limit } = request.query;
      const season =
        request.query.season ||
        (!from && !to ? await getDefaultSeason(leagueId) : null);

      if (!categoryId) {
        return reply.code(400).send({ error: "categoryId is required" });
      }

      let query = db
        .selectFrom("team_daily_category_ranks")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("category_id", "=", categoryId);

      if (season) {
        const seasonYear = parseInt(season, 10);
        query = query
          .where("snapshot_date", ">=", `${seasonYear}-01-01`)
          .where("snapshot_date", "<=", `${seasonYear}-12-31`);
      }

      if (from) {
        query = query.where("snapshot_date", ">=", from);
      }
      if (to) {
        query = query.where("snapshot_date", "<=", to);
      }
      if (teamIds) {
        const ids = teamIds.split(",").map((id) => parseInt(id, 10));
        query = query.where("team_id", "in", ids);
      }

      const queryLimit = limit ? parseInt(limit, 10) : 1000;
      const series = await query
        .orderBy("snapshot_date", "asc")
        .limit(queryLimit)
        .execute();

      return { series };
    },
  );

  // Category total values over time
  app.get<{
    Params: { leagueId: string };
    Querystring: TimeSeriesQuery & { categoryId: string };
  }>(
    "/api/leagues/:leagueId/timeseries/category-total",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseIntParam(request.params.leagueId, "leagueId");
      const { from, to, teamIds, categoryId, limit } = request.query;
      const season =
        request.query.season ||
        (!from && !to ? await getDefaultSeason(leagueId) : null);

      if (!categoryId) {
        return reply.code(400).send({ error: "categoryId is required" });
      }

      let query = db
        .selectFrom("team_daily_category_totals")
        .select([
          "league_id",
          "snapshot_date",
          "team_id",
          "category_id",
          "value",
        ])
        .where("league_id", "=", leagueId)
        .where("category_id", "=", categoryId);

      if (season) {
        const seasonYear = parseInt(season, 10);
        query = query
          .where("snapshot_date", ">=", `${seasonYear}-01-01`)
          .where("snapshot_date", "<=", `${seasonYear}-12-31`);
      }

      if (from) {
        query = query.where("snapshot_date", ">=", from);
      }
      if (to) {
        query = query.where("snapshot_date", "<=", to);
      }
      if (teamIds) {
        const ids = teamIds.split(",").map((id) => parseInt(id, 10));
        query = query.where("team_id", "in", ids);
      }

      const queryLimit = limit ? parseInt(limit, 10) : 1000;
      const series = await query
        .orderBy("snapshot_date", "asc")
        .limit(queryLimit)
        .execute();

      return { series };
    },
  );

  // Projected overall over time
  app.get<{
    Params: { leagueId: string };
    Querystring: TimeSeriesQuery;
  }>(
    "/api/leagues/:leagueId/timeseries/projected-overall",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request) => {
      const leagueId = parseIntParam(request.params.leagueId, "leagueId");
      const { from, to, teamIds, limit } = request.query;
      const season =
        request.query.season ||
        (!from && !to ? await getDefaultSeason(leagueId) : null);

      let query = db
        .selectFrom("team_daily_projected_overall")
        .selectAll()
        .where("league_id", "=", leagueId);

      if (season) {
        const seasonYear = parseInt(season, 10);
        query = query
          .where("snapshot_date", ">=", `${seasonYear}-01-01`)
          .where("snapshot_date", "<=", `${seasonYear}-12-31`);
      }

      if (from) {
        query = query.where("snapshot_date", ">=", from);
      }
      if (to) {
        query = query.where("snapshot_date", "<=", to);
      }
      if (teamIds) {
        const ids = teamIds.split(",").map((id) => parseInt(id, 10));
        query = query.where("team_id", "in", ids);
      }

      const queryLimit = limit ? parseInt(limit, 10) : 1000;
      const series = await query
        .orderBy("snapshot_date", "asc")
        .limit(queryLimit)
        .execute();

      return { series };
    },
  );

  // Projected standings for latest snapshot (by category)
  app.get<{
    Params: { leagueId: string };
    Querystring: { snapshotDate?: string };
  }>(
    "/api/leagues/:leagueId/standings/projected",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseIntParam(request.params.leagueId, "leagueId");
      const { snapshotDate } = request.query;

      // Get latest snapshot date if not provided
      let targetDate = snapshotDate;
      if (!targetDate) {
        const latest = await db
          .selectFrom("league_daily_snapshot")
          .select("snapshot_date")
          .where("league_id", "=", leagueId)
          .orderBy("snapshot_date", "desc")
          .executeTakeFirst();

        if (!latest) {
          return reply
            .code(404)
            .send({ error: "No snapshots found for this league" });
        }
        targetDate = latest.snapshot_date;
      }

      // Get teams for name lookup
      const teams = await db
        .selectFrom("team")
        .selectAll()
        .where("league_id", "=", leagueId)
        .execute();

      const teamMap = new Map<any, (typeof teams)[0]>(
        teams.map((t) => [t.id, t]),
      );

      // Get projected category standings
      const categoryStandings = await db
        .selectFrom("team_daily_projected_category")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", targetDate)
        .orderBy("category_id", "asc")
        .orderBy("projected_rank", "asc")
        .execute();

      // Get projected overall standings
      const overallStandings = await db
        .selectFrom("team_daily_projected_overall")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", targetDate)
        .orderBy("projected_overall_rank", "asc")
        .execute();

      // Find previous snapshot for delta computation
      const previousSnapshot = await db
        .selectFrom("league_daily_snapshot")
        .select("snapshot_date")
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "<", targetDate)
        .orderBy("snapshot_date", "desc")
        .executeTakeFirst();

      // Fetch previous projected overall if a previous snapshot exists
      let previousOverallMap = new Map<number, number>();
      if (previousSnapshot) {
        const previousOverall = await db
          .selectFrom("team_daily_projected_overall")
          .select(["team_id", "projected_overall_points"])
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", previousSnapshot.snapshot_date)
          .execute();
        previousOverallMap = new Map(
          previousOverall.map((po) => [
            po.team_id,
            po.projected_overall_points,
          ]),
        );
      }

      // Get current category totals and ranks
      const currentCategoryTotals = await db
        .selectFrom("team_daily_category_totals")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", targetDate)
        .execute();

      const currentCategoryRanks = await db
        .selectFrom("team_daily_category_ranks")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", targetDate)
        .execute();

      // Get current overall standings
      const currentOverallStandings = await db
        .selectFrom("team_daily_overall")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", targetDate)
        .orderBy("overall_rank", "asc")
        .execute();

      // Merge current totals + ranks into a single array
      const ranksMap = new Map(
        currentCategoryRanks.map((r) => [`${r.team_id}_${r.category_id}`, r]),
      );
      const currentCategoryStandings = currentCategoryTotals.map((t) => {
        const rankRow = ranksMap.get(`${t.team_id}_${t.category_id}`);
        return {
          league_id: t.league_id,
          snapshot_date: t.snapshot_date,
          team_id: t.team_id,
          category_id: t.category_id,
          value: t.value,
          rank: rankRow?.rank ?? 0,
          roto_points: rankRow?.roto_points ?? 0,
          teamName: teamMap.get(t.team_id)?.name || `Team ${t.team_id}`,
        };
      });

      // Get settings for category names
      const snapshot = await db
        .selectFrom("league_daily_snapshot")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("snapshot_date", "=", targetDate)
        .executeTakeFirst();

      let categories: unknown[] = [];
      if (snapshot?.settings_version_id) {
        const settings = await db
          .selectFrom("league_settings_version")
          .selectAll()
          .where("id", "=", snapshot.settings_version_id)
          .executeTakeFirst();

        if (settings) {
          categories = settings.settings_json.categories || [];
        }
      }

      // Run Monte Carlo simulation for overall roto point ranges
      // Uses per-category confidence intervals to simulate ranking outcomes
      const mcInput: TeamCategoryValue[] = [];
      const catArray = categories as Array<{
        category_id: string;
        direction: string;
      }>;
      for (const cs of categoryStandings) {
        const componentsJson = cs.projected_components_json as Record<
          string,
          unknown
        > | null;
        const ci = componentsJson?.confidence as
          | { p10: number; p50: number; p90: number }
          | undefined;
        mcInput.push({
          teamId: cs.team_id,
          categoryId: cs.category_id,
          projectedValue: cs.projected_value,
          confidence: ci,
        });
      }
      const overallConfidence =
        mcInput.length > 0
          ? monteCarloRotoPoints(
              mcInput,
              catArray.map((c) => ({
                categoryId: c.category_id,
                direction: c.direction as "HIGHER_BETTER" | "LOWER_BETTER",
              })),
              teams.length,
            )
          : new Map();

      return {
        snapshotDate: targetDate,
        previousSnapshotDate: previousSnapshot?.snapshot_date ?? null,
        categories,
        categoryStandings: categoryStandings.map((cs) => {
          const componentsJson = cs.projected_components_json as Record<
            string,
            unknown
          > | null;
          const confidence = componentsJson?.confidence as
            | { p10: number; p50: number; p90: number }
            | undefined;
          return {
            ...cs,
            teamName: teamMap.get(cs.team_id)?.name || `Team ${cs.team_id}`,
            confidence: confidence || null,
          };
        }),
        overallStandings: overallStandings.map((os) => {
          const prevPoints = previousOverallMap.get(os.team_id);
          const mc = overallConfidence.get(os.team_id);
          return {
            ...os,
            teamName: teamMap.get(os.team_id)?.name || `Team ${os.team_id}`,
            previousProjectedPoints: prevPoints ?? null,
            pointsDelta:
              prevPoints != null
                ? os.projected_overall_points - prevPoints
                : null,
            confidence: mc ? { p10: mc.p10, p50: mc.p50, p90: mc.p90 } : null,
          };
        }),
        currentCategoryStandings,
        currentOverallStandings: currentOverallStandings.map((os) => ({
          ...os,
          teamName: teamMap.get(os.team_id)?.name || `Team ${os.team_id}`,
        })),
      };
    },
  );

  // Standings swing attribution — explains WHY projected standings changed between snapshots
  app.get<{
    Params: { leagueId: string };
    Querystring: { teamId?: string; snapshotDate?: string };
  }>(
    "/api/leagues/:leagueId/standings/swing",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      try {
        const leagueId = parseIntParam(request.params.leagueId, "leagueId");
        const { teamId, snapshotDate } = request.query;

        if (!teamId) {
          return reply.code(400).send({ error: "teamId is required" });
        }

        const parsedTeamId = parseInt(teamId, 10);
        if (isNaN(parsedTeamId)) {
          return reply.code(400).send({ error: "teamId must be a number" });
        }

        // Resolve snapshotDate: use latest if not provided
        let currDate = snapshotDate;
        if (!currDate) {
          const latest = await db
            .selectFrom("league_daily_snapshot")
            .select("snapshot_date")
            .where("league_id", "=", leagueId)
            .orderBy("snapshot_date", "desc")
            .executeTakeFirst();

          if (!latest) {
            return reply
              .code(404)
              .send({ error: "No snapshots found for this league" });
          }
          currDate = latest.snapshot_date;
        }

        const agent = new StandingsSwingAttributionAgent(db, request.log);
        const result = await agent.computeSwing(
          leagueId,
          parsedTeamId,
          currDate,
        );
        return result;
      } catch (err) {
        request.log.error(
          { err },
          "Failed to compute standings swing attribution",
        );
        return reply.code(500).send({ error: "Failed to compute attribution" });
      }
    },
  );

  // League categories
  app.get<{
    Params: { leagueId: string };
  }>(
    "/api/leagues/:leagueId/categories",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseIntParam(request.params.leagueId, "leagueId");

      // Get the latest settings version for this league
      const settingsVersion = await db
        .selectFrom("league_settings_version")
        .selectAll()
        .where("league_id", "=", leagueId)
        .orderBy("effective_date", "desc")
        .executeTakeFirst();

      if (!settingsVersion) {
        return reply
          .code(404)
          .send({ error: "No settings found for this league" });
      }

      const categories = settingsVersion.settings_json.categories || [];
      return { categories };
    },
  );

  // Transaction annotations
  app.get<{
    Params: { leagueId: string };
    Querystring: TimeSeriesQuery;
  }>(
    "/api/leagues/:leagueId/timeseries/annotations",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request) => {
      const leagueId = parseIntParam(request.params.leagueId, "leagueId");
      const { from, to, teamIds, season } = request.query;

      let query = db
        .selectFrom("league_transaction_event")
        .selectAll()
        .where("league_id", "=", leagueId);

      if (season) {
        const seasonYear = parseInt(season, 10);
        query = query
          .where("event_date", ">=", `${seasonYear}-01-01`)
          .where("event_date", "<=", `${seasonYear}-12-31`);
      }

      if (from) {
        query = query.where("event_date", ">=", from);
      }
      if (to) {
        query = query.where("event_date", "<=", to);
      }
      if (teamIds) {
        const ids = teamIds.split(",").map((id) => parseInt(id, 10));
        query = query.where("team_id", "in", ids);
      }

      const annotations = await query.orderBy("event_date", "asc").execute();

      // Collect all player IDs from annotations
      const playerIds = new Set<number>();
      annotations.forEach((ann) => {
        if (ann.players_added && Array.isArray(ann.players_added)) {
          ann.players_added.forEach((id: number) => playerIds.add(id));
        }
        if (ann.players_dropped && Array.isArray(ann.players_dropped)) {
          ann.players_dropped.forEach((id: number) => playerIds.add(id));
        }
      });

      // Fetch player names
      const playerMap = new Map<number, { id: number; name: string }>();
      if (playerIds.size > 0) {
        const players = await db
          .selectFrom("player")
          .select(["id", "name"])
          .where("id", "in", Array.from(playerIds))
          .execute();

        players.forEach((p) => {
          playerMap.set(p.id, { id: p.id, name: p.name });
        });
      }

      // Collect all team IDs
      const teamIds_set = new Set<number>();
      annotations.forEach((ann) => {
        teamIds_set.add(ann.team_id);
      });

      // Fetch team names
      const teamMap = new Map<number, string>();
      if (teamIds_set.size > 0) {
        const teams = await db
          .selectFrom("team")
          .select(["id", "name"])
          .where("id", "in", Array.from(teamIds_set))
          .execute();

        teams.forEach((t) => {
          teamMap.set(t.id, t.name);
        });
      }

      // Enrich annotations with player names and team names
      const enrichedAnnotations = annotations.map((ann) => {
        const players_added_details = (
          (ann.players_added as number[]) || []
        ).map((id) => playerMap.get(id) || { id, name: "Unknown Player" });
        const players_dropped_details = (
          (ann.players_dropped as number[]) || []
        ).map((id) => playerMap.get(id) || { id, name: "Unknown Player" });
        const team_name = teamMap.get(ann.team_id);

        return {
          ...ann,
          players_added_details,
          players_dropped_details,
          team_name,
        };
      });

      return { annotations: enrichedAnnotations };
    },
  );

  // Inflection points (biggest ranking changes)
  app.get<{
    Params: { leagueId: string };
    Querystring: TimeSeriesQuery & {
      teamId: string;
      limit?: string;
      categoryId?: string;
    };
  }>(
    "/api/leagues/:leagueId/timeseries/inflection-points",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseIntParam(request.params.leagueId, "leagueId");
      const {
        teamId,
        from,
        to,
        season,
        limit: limitStr,
        categoryId,
      } = request.query;

      if (!teamId) {
        return reply.code(400).send({ error: "teamId is required" });
      }

      const parsedTeamId = parseInt(teamId, 10);
      const limit = Math.min(parseInt(limitStr || "5", 10), 10);

      // Category-specific mode: find biggest rank jumps in a single category
      if (categoryId) {
        let catQuery = db
          .selectFrom("team_daily_category_ranks")
          .selectAll()
          .where("league_id", "=", leagueId)
          .where("team_id", "=", parsedTeamId)
          .where("category_id", "=", categoryId);

        if (season) {
          const seasonYear = parseInt(season, 10);
          catQuery = catQuery
            .where("snapshot_date", ">=", `${seasonYear}-01-01`)
            .where("snapshot_date", "<=", `${seasonYear}-12-31`);
        }
        if (from) catQuery = catQuery.where("snapshot_date", ">=", from);
        if (to) catQuery = catQuery.where("snapshot_date", "<=", to);

        const catSnapshots = await catQuery
          .orderBy("snapshot_date", "asc")
          .execute();

        // Compute rank deltas between consecutive snapshots
        const catDeltas: Array<{
          date: string;
          previousDate: string;
          rankBefore: number;
          rankAfter: number;
          rankDelta: number;
          ptsBefore: number;
          ptsAfter: number;
        }> = [];

        for (let i = 1; i < catSnapshots.length; i++) {
          const prev = catSnapshots[i - 1];
          const curr = catSnapshots[i];
          const rankDelta = prev.rank - curr.rank; // positive = improved (lower rank is better)

          if (rankDelta !== 0) {
            catDeltas.push({
              date: curr.snapshot_date,
              previousDate: prev.snapshot_date,
              rankBefore: prev.rank,
              rankAfter: curr.rank,
              rankDelta,
              ptsBefore: prev.roto_points ?? 0,
              ptsAfter: curr.roto_points ?? 0,
            });
          }
        }

        // Sort by absolute rank change, take top N
        catDeltas.sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta));
        const topCatDeltas = catDeltas.slice(0, limit);

        // Enrich with transactions
        const inflectionPoints = await Promise.all(
          topCatDeltas.map(async (delta) => {
            const rosterMoves = await db
              .selectFrom("roster_move")
              .innerJoin("player", "player.id", "roster_move.player_id")
              .select([
                "roster_move.id",
                "roster_move.move_type",
                "roster_move.effective_date",
                "roster_move.player_id",
                "player.name as player_name",
              ])
              .where("roster_move.league_id", "=", leagueId)
              .where("roster_move.team_id", "=", parsedTeamId)
              .where("roster_move.effective_date", ">", delta.previousDate)
              .where("roster_move.effective_date", "<=", delta.date)
              .where("roster_move.move_type", "!=", "draft")
              .orderBy("roster_move.effective_date", "asc")
              .execute();

            // Group by date into transaction events
            const byDate = new Map<string, typeof rosterMoves>();
            for (const m of rosterMoves) {
              const d = m.effective_date;
              if (!byDate.has(d)) byDate.set(d, []);
              byDate.get(d)!.push(m);
            }

            const enrichedTransactions = Array.from(byDate.entries()).map(
              ([date, moves]) => ({
                id: moves[0].id,
                eventType: moves.some((m) => m.move_type.startsWith("trade"))
                  ? "trade"
                  : "waiver",
                eventDate: date,
                playersAdded: moves
                  .filter(
                    (m) => m.move_type === "add" || m.move_type === "trade_in",
                  )
                  .map((m) => ({ id: m.player_id, name: m.player_name })),
                playersDropped: moves
                  .filter(
                    (m) =>
                      m.move_type === "drop" || m.move_type === "trade_out",
                  )
                  .map((m) => ({ id: m.player_id, name: m.player_name })),
              }),
            );

            return {
              date: delta.date,
              previousDate: delta.previousDate,
              categoryId,
              rankBefore: delta.rankBefore,
              rankAfter: delta.rankAfter,
              rankDelta: delta.rankDelta,
              ptsBefore: delta.ptsBefore,
              ptsAfter: delta.ptsAfter,
              transactions: enrichedTransactions,
            };
          }),
        );

        return { inflectionPoints };
      }

      // Overall mode (original): find biggest overall points changes
      let query = db
        .selectFrom("team_daily_overall")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("team_id", "=", parsedTeamId);

      if (season) {
        const seasonYear = parseInt(season, 10);
        query = query
          .where("snapshot_date", ">=", `${seasonYear}-01-01`)
          .where("snapshot_date", "<=", `${seasonYear}-12-31`);
      }

      if (from) {
        query = query.where("snapshot_date", ">=", from);
      }
      if (to) {
        query = query.where("snapshot_date", "<=", to);
      }

      const snapshots = await query.orderBy("snapshot_date", "asc").execute();

      const deltas: Array<{
        date: string;
        previousDate: string;
        pointsDelta: number;
        rankBefore: number;
        rankAfter: number;
      }> = [];

      for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshots[i - 1];
        const curr = snapshots[i];
        const delta = curr.overall_points - prev.overall_points;

        deltas.push({
          date: curr.snapshot_date,
          previousDate: prev.snapshot_date,
          pointsDelta: delta,
          rankBefore: prev.overall_rank,
          rankAfter: curr.overall_rank,
        });
      }

      deltas.sort((a, b) => Math.abs(b.pointsDelta) - Math.abs(a.pointsDelta));
      const topDeltas = deltas.slice(0, limit);

      const inflectionPoints = await Promise.all(
        topDeltas.map(async (delta) => {
          const prevCategoryRanks = await db
            .selectFrom("team_daily_category_ranks")
            .selectAll()
            .where("league_id", "=", leagueId)
            .where("team_id", "=", parsedTeamId)
            .where("snapshot_date", "=", delta.previousDate)
            .execute();

          const currCategoryRanks = await db
            .selectFrom("team_daily_category_ranks")
            .selectAll()
            .where("league_id", "=", leagueId)
            .where("team_id", "=", parsedTeamId)
            .where("snapshot_date", "=", delta.date)
            .execute();

          const prevMap = new Map(
            prevCategoryRanks.map((r) => [
              r.category_id,
              { rank: r.rank, rotoPts: r.roto_points },
            ]),
          );
          const currMap = new Map(
            currCategoryRanks.map((r) => [
              r.category_id,
              { rank: r.rank, rotoPts: r.roto_points },
            ]),
          );

          const categoryChanges: Array<{
            categoryId: string;
            deltaPts: number;
            rankBefore: number;
            rankAfter: number;
          }> = [];

          currMap.forEach((curr, catId) => {
            const prev = prevMap.get(catId);
            if (!prev) return;
            const prevPts = prev.rotoPts ?? 0;
            const currPts = curr.rotoPts ?? 0;
            const deltaPts = currPts - prevPts;
            if (deltaPts !== 0) {
              categoryChanges.push({
                categoryId: catId,
                deltaPts,
                rankBefore: prev.rank,
                rankAfter: curr.rank,
              });
            }
          });

          categoryChanges.sort(
            (a, b) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts),
          );

          const rosterMoves = await db
            .selectFrom("roster_move")
            .innerJoin("player", "player.id", "roster_move.player_id")
            .select([
              "roster_move.id",
              "roster_move.move_type",
              "roster_move.effective_date",
              "roster_move.player_id",
              "player.name as player_name",
            ])
            .where("roster_move.league_id", "=", leagueId)
            .where("roster_move.team_id", "=", parsedTeamId)
            .where("roster_move.effective_date", ">", delta.previousDate)
            .where("roster_move.effective_date", "<=", delta.date)
            .where("roster_move.move_type", "!=", "draft")
            .orderBy("roster_move.effective_date", "asc")
            .execute();

          const byDate = new Map<string, typeof rosterMoves>();
          for (const m of rosterMoves) {
            const d = m.effective_date;
            if (!byDate.has(d)) byDate.set(d, []);
            byDate.get(d)!.push(m);
          }

          const enrichedTransactions = Array.from(byDate.entries()).map(
            ([date, moves]) => ({
              id: moves[0].id,
              eventType: moves.some((m) => m.move_type.startsWith("trade"))
                ? "trade"
                : "waiver",
              eventDate: date,
              playersAdded: moves
                .filter(
                  (m) => m.move_type === "add" || m.move_type === "trade_in",
                )
                .map((m) => ({ id: m.player_id, name: m.player_name })),
              playersDropped: moves
                .filter(
                  (m) => m.move_type === "drop" || m.move_type === "trade_out",
                )
                .map((m) => ({ id: m.player_id, name: m.player_name })),
            }),
          );

          return {
            date: delta.date,
            previousDate: delta.previousDate,
            pointsDelta: delta.pointsDelta,
            rankBefore: delta.rankBefore,
            rankAfter: delta.rankAfter,
            categoryChanges,
            transactions: enrichedTransactions,
          };
        }),
      );

      return { inflectionPoints };
    },
  );

  // Phase 81: SSE live standings change log
  app.get<{ Params: { leagueId: string }; Querystring: { limit?: string } }>(
    "/api/leagues/:leagueId/standings/live-log",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      if (isNaN(leagueId)) {
        return reply.code(400).send({ error: "Invalid leagueId" });
      }
      const historyLimit = Math.min(
        parseInt(request.query.limit ?? "50", 10),
        200,
      );

      // Tell Fastify not to manage the response
      reply.hijack();

      // SSE headers
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.setHeader("X-Accel-Buffering", "no");
      reply.raw.flushHeaders();

      function sendEvent(data: unknown): void {
        if (reply.raw.writable) {
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        }
      }

      // Send historical events on connect
      try {
        const history = await db
          .selectFrom("standings_change_event")
          .selectAll()
          .where("league_id", "=", leagueId)
          .orderBy("occurred_at", "desc")
          .limit(historyLimit)
          .execute();

        for (const event of history.reverse()) {
          sendEvent({ type: "event", data: event });
        }
        sendEvent({ type: "history_end", count: history.length });
      } catch (_err) {
        sendEvent({ type: "error", message: "Failed to load history" });
      }

      // Subscribe to live events
      function onNewEvent(payload: {
        leagueId: number;
        snapshotDate: string;
      }): void {
        if (payload.leagueId !== leagueId) return;
        db.selectFrom("standings_change_event")
          .selectAll()
          .where("league_id", "=", leagueId)
          .where("snapshot_date", "=", payload.snapshotDate)
          .orderBy("occurred_at", "asc")
          .execute()
          .then((events) => {
            for (const event of events) {
              sendEvent({ type: "event", data: event });
            }
          })
          .catch(() => {
            /* ignore */
          });
      }

      changeLogEmitter.on(CHANGE_LOG_EVENT, onNewEvent);

      // Subscribe to live poll signals (even when no events, update "last polled" on client)
      function onLivePoll(signal: LivePollSignal): void {
        if (signal.leagueId !== leagueId) return;
        sendEvent({ type: "live_poll", data: { polledAt: signal.polledAt } });
      }

      changeLogEmitter.on(LIVE_POLL_EVENT, onLivePoll);

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        sendEvent({ type: "heartbeat", ts: Date.now() });
      }, 30_000);

      // Cleanup on disconnect
      request.raw.on("close", () => {
        clearInterval(heartbeat);
        changeLogEmitter.off(CHANGE_LOG_EVENT, onNewEvent);
        changeLogEmitter.off(LIVE_POLL_EVENT, onLivePoll);
        if (reply.raw.writable) reply.raw.end();
      });
    },
  );

  // Phase 81: REST paginated change log history
  app.get<{
    Params: { leagueId: string };
    Querystring: { limit?: string; before?: string };
  }>(
    "/api/leagues/:leagueId/standings/change-log",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      try {
        const leagueId = parseInt(request.params.leagueId, 10);
        if (isNaN(leagueId)) {
          return reply.code(400).send({ error: "Invalid leagueId" });
        }
        const limit = Math.min(parseInt(request.query.limit ?? "50", 10), 200);

        let query = db
          .selectFrom("standings_change_event")
          .selectAll()
          .where("league_id", "=", leagueId);

        if (request.query.before) {
          const beforeDate = new Date(request.query.before);
          if (!isNaN(beforeDate.getTime())) {
            query = query.where("occurred_at", "<", beforeDate);
          }
        }

        const events = await query
          .orderBy("occurred_at", "desc")
          .limit(limit)
          .execute();

        return { events };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply.code(500).send({ error: msg });
      }
    },
  );

  // Phase 82: Manual live refresh trigger
  app.post<{ Params: { leagueId: string } }>(
    "/api/leagues/:leagueId/live-refresh",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      try {
        const leagueId = parseIntParam(request.params.leagueId, "leagueId");
        const today = new Date().toISOString().split("T")[0];
        const agent = new LivePollAgent(db, request.log);
        const eventCount = await agent.refresh(leagueId, today);
        return reply.send({ polledAt: new Date().toISOString(), eventCount });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return reply.code(500).send({ error: msg });
      }
    },
  );
}
