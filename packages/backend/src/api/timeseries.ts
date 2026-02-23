import type { FastifyInstance } from "fastify";
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
  season?: string; // year filter
}

export async function timeSeriesRoutes(app: FastifyInstance) {
  const db = getDb();
  const { sql } = await import("kysely");

  // Available seasons for a league
  app.get<{
    Params: { leagueId: string };
  }>(
    "/api/leagues/:leagueId/seasons",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request) => {
      const leagueId = parseInt(request.params.leagueId, 10);

      const result = await db
        .selectFrom("league_daily_snapshot")
        .select(sql<number>`DISTINCT EXTRACT(YEAR FROM snapshot_date::date)::integer`.as("season"))
        .where("league_id", "=", leagueId)
        .orderBy("season", "desc")
        .execute();

      const seasons = result.map((r) => r.season);
      return { seasons };
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
      const leagueId = parseInt(request.params.leagueId, 10);
      const { from, to, teamIds, season } = request.query;

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

      const series = await query.orderBy("snapshot_date", "asc").execute();

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
      const leagueId = parseInt(request.params.leagueId, 10);
      const { from, to, teamIds, categoryId, season } = request.query;

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

      const series = await query.orderBy("snapshot_date", "asc").execute();

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
      const leagueId = parseInt(request.params.leagueId, 10);
      const { from, to, teamIds, categoryId, season } = request.query;

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

      const series = await query.orderBy("snapshot_date", "asc").execute();

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
      const leagueId = parseInt(request.params.leagueId, 10);
      const { from, to, teamIds, season } = request.query;

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

      const series = await query.orderBy("snapshot_date", "asc").execute();

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
      const leagueId = parseInt(request.params.leagueId, 10);

      // Get the latest settings version for this league
      const settingsVersion = await db
        .selectFrom("league_settings_version")
        .selectAll()
        .where("league_id", "=", leagueId)
        .orderBy("effective_date", "desc")
        .executeTakeFirst();

      if (!settingsVersion) {
        return reply.code(404).send({ error: "No settings found for this league" });
      }

      const categories = (settingsVersion.settings_json as any).categories || [];
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
      const leagueId = parseInt(request.params.leagueId, 10);
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
        const players_added_details = (ann.players_added as number[] || []).map(
          (id) =>
            playerMap.get(id) || { id, name: "Unknown Player" },
        );
        const players_dropped_details = (ann.players_dropped as number[] || []).map(
          (id) =>
            playerMap.get(id) || { id, name: "Unknown Player" },
        );
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
    Querystring: TimeSeriesQuery & { teamId: string; limit?: string };
  }>(
    "/api/leagues/:leagueId/timeseries/inflection-points",
    {
      onRequest: [authenticate],
      preHandler: [requireLeagueAccess],
    },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      const { teamId, from, to, season, limit: limitStr } = request.query;

      if (!teamId) {
        return reply.code(400).send({ error: "teamId is required" });
      }

      const parsedTeamId = parseInt(teamId, 10);
      const limit = Math.min(parseInt(limitStr || "5", 10), 10);

      // Fetch team_daily_overall for the team
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

      // Compute deltas between consecutive snapshots
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

      // Sort by absolute delta, take top N
      deltas.sort((a, b) => Math.abs(b.pointsDelta) - Math.abs(a.pointsDelta));
      const topDeltas = deltas.slice(0, limit);

      // For each inflection point, fetch category breakdowns and transactions
      const inflectionPoints = await Promise.all(
        topDeltas.map(async (delta) => {
          // Fetch category ranks for both dates
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

          // Build map for quick lookup
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

          // Compute category deltas
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

          // Sort by absolute delta descending
          categoryChanges.sort(
            (a, b) => Math.abs(b.deltaPts) - Math.abs(a.deltaPts),
          );

          // Fetch correlated transactions (between previousDate and date, inclusive)
          let txQuery = db
            .selectFrom("league_transaction_event")
            .selectAll()
            .where("league_id", "=", leagueId)
            .where("team_id", "=", parsedTeamId)
            .where("event_date", ">", delta.previousDate)
            .where("event_date", "<=", delta.date)
            .orderBy("event_date", "asc");

          const transactions = await txQuery.execute();

          // Enrich transactions with player names
          const playerIds = new Set<number>();
          transactions.forEach((tx) => {
            if (tx.players_added && Array.isArray(tx.players_added)) {
              tx.players_added.forEach((id: number) => playerIds.add(id));
            }
            if (tx.players_dropped && Array.isArray(tx.players_dropped)) {
              tx.players_dropped.forEach((id: number) => playerIds.add(id));
            }
          });

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

          const enrichedTransactions = transactions.map((tx) => {
            const playersAdded = (tx.players_added as number[] || []).map(
              (id) => playerMap.get(id) || { id, name: "Unknown Player" },
            );
            const playersDropped = (tx.players_dropped as number[] || []).map(
              (id) => playerMap.get(id) || { id, name: "Unknown Player" },
            );

            return {
              id: tx.id,
              eventType: tx.event_type,
              eventDate: tx.event_date,
              playersAdded,
              playersDropped,
            };
          });

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
}
