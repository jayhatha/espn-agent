import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { sql } from "kysely";
import { getDb } from "../db/connection.js";
import { ProjectionsIngestAgent } from "../agents/projections-ingest.js";

/**
 * Projections API Routes
 * Per DESIGN_DOC.md §9
 */

interface UploadProjectionsBody {
  battersCsv?: string;
  pitchersCsv?: string;
  asOfDate: string;
}

export async function projectionsRoutes(app: FastifyInstance) {
  const db = getDb();

  // Upload projections
  app.post(
    "/api/projections/upload",
    async (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      try {
        // Get file from multipart form data
        const data = await request.file();
        if (!data) {
          return reply.code(400).send({ error: "No file uploaded" });
        }

        // Read file content
        const buffer = await data.toBuffer();
        const csvContent = buffer.toString("utf-8");

        const agent = new ProjectionsIngestAgent(db, request.log);

        const today = new Date().toISOString().split("T")[0];

        // Auto-detect batters vs pitchers by checking column headers
        // Detect pitchers first: IP/ERA/ER are uniquely pitching columns.
        // HR/H/BB appear in both batter and pitcher CSVs (HR allowed, hits allowed, etc.)
        const firstLine = csvContent.replace(/^\uFEFF/, "").split(/\r?\n/)[0] || "";
        const headers = firstLine.split(",").map((h) => h.trim());
        const isPitchers = headers.includes("IP") || headers.includes("ERA") || headers.includes("ER");
        const isBatters = !isPitchers;

        const result = await agent.ingest({
          battersCsv: isBatters ? csvContent : undefined,
          pitchersCsv: !isBatters ? csvContent : undefined,
          asOfDate: today,
        });

        // Re-snapshot leagues that have degraded snapshots due to missing/stale projections
        const degradedLeagues = await db
          .selectFrom("league")
          .innerJoin("league_daily_snapshot", "league.id", "league_daily_snapshot.league_id")
          .select(["league.id", "league.espn_swid", "league.espn_s2"])
          .where("league_daily_snapshot.is_degraded", "=", true)
          .where(
            sql`(league_daily_snapshot.degraded_reasons @> ARRAY['projections_missing']::text[] OR league_daily_snapshot.degraded_reasons @> ARRAY['projections_stale']::text[])`
          )
          .groupBy(["league.id", "league.espn_swid", "league.espn_s2"])
          .execute();

        if (degradedLeagues.length > 0) {
          request.log.info(
            { leagueCount: degradedLeagues.length },
            "Triggering re-snapshots for degraded leagues"
          );

          // Import and trigger snapshots in background
          const { SnapshotOrchestratorAgent } = await import(
            "../agents/snapshot-orchestrator.js"
          );

          // Fire and forget - don't wait for snapshots to complete
          Promise.all(
            degradedLeagues.map(async (league) => {
              try {
                const orchestrator = new SnapshotOrchestratorAgent(db, request.log);
                const auth =
                  league.espn_swid && league.espn_s2
                    ? { SWID: league.espn_swid, espn_s2: league.espn_s2 }
                    : undefined;

                await orchestrator.executeSnapshot({
                  leagueId: league.id,
                  snapshotDate: today,
                  espnAuth: auth,
                  forceFresh: true,
                });
              } catch (error) {
                request.log.error({ error, leagueId: league.id }, "Failed to re-snapshot league");
              }
            })
          ).catch((error) => {
            request.log.error({ error }, "Error during re-snapshots");
          });
        }

        return {
          projectionsRunId: result.projectionsRunId,
          batters: result.battersReport,
          pitchers: result.pitchersReport,
        };
      } catch (error) {
        request.log.error({ error }, "Projections upload failed");
        const errorMessage =
          error instanceof Error ? error.message : "Projections upload failed";
        return reply
          .code(500)
          .send({ error: "Projections upload failed", details: errorMessage });
      }
    },
  );

  // Get projections run
  app.get(
    "/api/projections/:runId",
    async (
      request: FastifyRequest<{ Params: { runId: string } }>,
      reply: FastifyReply,
    ) => {
      const runId = parseInt(request.params.runId, 10);

      const run = await db
        .selectFrom("projections_run")
        .selectAll()
        .where("id", "=", runId)
        .executeTakeFirst();

      if (!run) {
        return reply.code(404).send({ error: "Projections run not found" });
      }

      return run;
    },
  );

  // List projections runs
  app.get(
    "/api/projections",
    async (
      request: FastifyRequest<{ Querystring: { limit?: string } }>,
      reply: FastifyReply,
    ) => {
      const limit = parseInt(request.query.limit || "20", 10);

      const runs = await db
        .selectFrom("projections_run")
        .selectAll()
        .orderBy("as_of_date", "desc")
        .limit(limit)
        .execute();

      return { runs };
    },
  );
}
