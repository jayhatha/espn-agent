import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getDb } from "../db/connection.js";
import { authenticate, requireLeagueAccess } from "../middleware/auth.js";

/**
 * Time Series API Routes
 * Per DESIGN_DOC.md §9.2
 */

interface TimeSeriesQuery {
  from?: string;
  to?: string;
  teamIds?: string; // comma-separated
}

export async function timeSeriesRoutes(app: FastifyInstance) {
  const db = getDb();

  // Overall standings over time
  app.get(
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
    async (
      request: FastifyRequest<{
        Params: { leagueId: string };
        Querystring: TimeSeriesQuery;
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { from, to, teamIds } = request.query;

      let query = db
        .selectFrom("team_daily_overall")
        .selectAll()
        .where("league_id", "=", leagueId);

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

      const series = await query.orderBy("snapshot_date", "asc").execute();

      return { series };
    },
  );

  // Category rank over time
  app.get(
    "/api/leagues/:leagueId/timeseries/category-rank",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (
      request: FastifyRequest<{
        Params: { leagueId: string };
        Querystring: TimeSeriesQuery & { categoryId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { from, to, teamIds, categoryId } = request.query;

      if (!categoryId) {
        return reply.code(400).send({ error: "categoryId is required" });
      }

      let query = db
        .selectFrom("team_daily_category_ranks")
        .selectAll()
        .where("league_id", "=", leagueId)
        .where("category_id", "=", categoryId);

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

      const series = await query.orderBy("snapshot_date", "asc").execute();

      return { series };
    },
  );

  // Projected overall over time
  app.get(
    "/api/leagues/:leagueId/timeseries/projected-overall",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (
      request: FastifyRequest<{
        Params: { leagueId: string };
        Querystring: TimeSeriesQuery;
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { from, to, teamIds } = request.query;

      let query = db
        .selectFrom("team_daily_projected_overall")
        .selectAll()
        .where("league_id", "=", leagueId);

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

      const series = await query.orderBy("snapshot_date", "asc").execute();

      return { series };
    },
  );

  // Projected standings for latest snapshot (by category)
  app.get(
    "/api/leagues/:leagueId/standings/projected",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (
      request: FastifyRequest<{
        Params: { leagueId: string };
        Querystring: { snapshotDate?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
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
          return reply.code(404).send({ error: "No snapshots found for this league" });
        }
        targetDate = latest.snapshot_date;
      }

      // Get teams for name lookup
      const teams = await db
        .selectFrom("team")
        .selectAll()
        .where("league_id", "=", leagueId)
        .execute();

      const teamMap = new Map(teams.map((t) => [t.id, t]));

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
        currentCategoryRanks.map((r) => [`${r.team_id}_${r.category_id}`, r])
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
          categories = (settings.settings_json as any).categories || [];
        }
      }

      return {
        snapshotDate: targetDate,
        categories,
        categoryStandings: categoryStandings.map((cs) => ({
          ...cs,
          teamName: teamMap.get(cs.team_id)?.name || `Team ${cs.team_id}`,
        })),
        overallStandings: overallStandings.map((os) => ({
          ...os,
          teamName: teamMap.get(os.team_id)?.name || `Team ${os.team_id}`,
        })),
        currentCategoryStandings,
        currentOverallStandings: currentOverallStandings.map((os) => ({
          ...os,
          teamName: teamMap.get(os.team_id)?.name || `Team ${os.team_id}`,
        })),
      };
    },
  );

  // Transaction annotations
  app.get(
    "/api/leagues/:leagueId/timeseries/annotations",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (
      request: FastifyRequest<{
        Params: { leagueId: string };
        Querystring: TimeSeriesQuery;
      }>,
      reply: FastifyReply,
    ) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { from, to, teamIds } = request.query;

      let query = db
        .selectFrom("league_transaction_event")
        .selectAll()
        .where("league_id", "=", leagueId);

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

      return { annotations };
    },
  );
}
