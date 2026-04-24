import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { sql } from "kysely";
import { getDb } from "../db/connection.js";
import { ProjectionsIngestAgent } from "../agents/projections-ingest.js";
import { decryptToken, hasEncryptionKey } from "../utils/encryption.js";
import { authenticate } from "../middleware/auth.js";
import { getEspnAuthFromEnv } from "../utils/espn-env.js";

/**
 * Projections API Routes
 * Per DESIGN_DOC.md §9
 */

/**
 * Helper function to trigger re-snapshots for degraded leagues
 */
async function triggerDegradedLeagueResnapshots(
  db: any,
  log: any,
  today: string,
  projectionsNowFresh: boolean = false,
) {
  // When projections just became fully fresh (both batters + pitchers uploaded), re-snapshot
  // ALL leagues that have a snapshot for today — even ones previously marked non-degraded,
  // because an earlier partial upload may have triggered a re-snapshot that computed
  // projected standings with incomplete projections data.
  //
  // When projections are still partial (stale), only re-snapshot leagues that are
  // explicitly marked degraded due to missing/stale projections.
  let degradedLeagues: any[];

  if (projectionsNowFresh) {
    // Re-snapshot all leagues that have any snapshot for today
    degradedLeagues = await db
      .selectFrom("league")
      .innerJoin("league_daily_snapshot", "league.id", "league_daily_snapshot.league_id")
      .select([
        "league.id",
        "league.espn_swid_encrypted",
        "league.espn_s2_encrypted",
      ])
      .where("league_daily_snapshot.snapshot_date", "=", today)
      .groupBy([
        "league.id",
        "league.espn_swid_encrypted",
        "league.espn_s2_encrypted",
      ])
      .execute();
  } else {
    degradedLeagues = await db
      .selectFrom("league")
      .innerJoin("league_daily_snapshot", "league.id", "league_daily_snapshot.league_id")
      .select([
        "league.id",
        "league.espn_swid_encrypted",
        "league.espn_s2_encrypted",
      ])
      .where("league_daily_snapshot.is_degraded", "=", true)
      .where(
        sql`(league_daily_snapshot.degraded_reasons @> ARRAY['projections_missing']::text[] OR league_daily_snapshot.degraded_reasons @> ARRAY['projections_stale']::text[])` as any
      )
      .groupBy([
        "league.id",
        "league.espn_swid_encrypted",
        "league.espn_s2_encrypted",
      ])
      .execute();
  }

  if (degradedLeagues.length > 0) {
    log.info(
      { leagueCount: degradedLeagues.length },
      "Triggering re-snapshots for degraded leagues"
    );

    // Import and trigger snapshots in background
    const { SnapshotOrchestratorAgent } = await import(
      "../agents/snapshot-orchestrator.js"
    );

    // Fire and forget - don't wait for snapshots to complete
    Promise.all(
      degradedLeagues.map(async (league: any) => {
        try {
          const orchestrator = new SnapshotOrchestratorAgent(db, log);

          // ESPN auth: env vars first, then encrypted DB fallback
          let auth: { SWID: string; espn_s2: string } | undefined = getEspnAuthFromEnv();
          if (!auth && league.espn_swid_encrypted && league.espn_s2_encrypted) {
            if (!hasEncryptionKey()) {
              log.error({ leagueId: league.id }, "ENCRYPTION_KEY not configured - cannot decrypt credentials");
              return;
            }
            try {
              auth = {
                SWID: decryptToken(league.espn_swid_encrypted),
                espn_s2: decryptToken(league.espn_s2_encrypted),
              };
            } catch (error) {
              log.error({ error, leagueId: league.id }, "Failed to decrypt ESPN cookies");
              return;
            }
          }

          await orchestrator.executeSnapshot({
            leagueId: league.id,
            snapshotDate: today,
            espnAuth: auth,
            forceFresh: true,
          });
        } catch (error) {
          log.error({ error, leagueId: league.id }, "Failed to re-snapshot league");
        }
      })
    ).catch((error) => {
      log.error({ error }, "Error during re-snapshots");
    });
  }
}

export async function projectionsRoutes(app: FastifyInstance) {
  const db = getDb();

  // Upload projections (admin only - projections are shared across all users/leagues)
  app.post(
    "/api/projections/upload",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
        },
      },
      preHandler: [
        authenticate,
        async (request: any, reply: FastifyReply) => {
          if (request.user.role !== "admin") {
            return reply.code(403).send({
              error: "Forbidden",
              message: "Only administrators can upload projections. Projections are shared across all leagues.",
            });
          }
        },
      ],
    },
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

        // Check if this upload completed the projections run (both batters + pitchers present)
        const updatedRun = await db
          .selectFrom("projections_run")
          .select(["staleness"])
          .where("id", "=", result.projectionsRunId)
          .executeTakeFirst();
        const projectionsNowFresh = updatedRun?.staleness === "fresh";

        // Re-snapshot leagues: if projections are now fully fresh, re-snapshot all leagues
        // that have a snapshot today (not just degraded ones), to recompute projected standings
        // with complete projections data. If still partial, only re-snapshot degraded leagues.
        await triggerDegradedLeagueResnapshots(db, request.log, today, projectionsNowFresh);

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

  // Upload batch (batter + pitcher CSVs in one request)
  app.post(
    "/api/projections/upload-batch",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 hour",
        },
      },
      preHandler: [
        authenticate,
        async (request: any, reply: any) => {
          if (request.user.role !== "admin") {
            return reply.code(403).send({
              error: "Forbidden",
              message: "Only administrators can upload projections. Projections are shared across all leagues.",
            });
          }
        },
      ],
    },
    async (
      request: any,
      reply: any,
    ) => {
      try {
        const today = new Date().toISOString().split("T")[0];
        const agent = new ProjectionsIngestAgent(db, request.log);

        let battersCsv: string | undefined;
        let pitchersCsv: string | undefined;

        // Read all files from multipart request
        const files = request.files();
        let hasFiles = false;

        for await (const file of files) {
          hasFiles = true;
          const buffer = await file.toBuffer();
          const csvContent = buffer.toString("utf-8");

          // Auto-detect batters vs pitchers by field name first, then by headers
          let isPitchers = false;
          let isBatters = false;

          if (file.fieldname === "pitcher" || file.fieldname === "pitchers") {
            isPitchers = true;
          } else if (file.fieldname === "batter" || file.fieldname === "batters") {
            isBatters = true;
          } else {
            // Auto-detect from headers
            const firstLine = csvContent.replace(/^\uFEFF/, "").split(/\r?\n/)[0] || "";
            const headers = firstLine.split(",").map((h: string) => h.trim());
            isPitchers = headers.includes("IP") || headers.includes("ERA") || headers.includes("ER");
            isBatters = !isPitchers;
          }

          if (isBatters) {
            battersCsv = csvContent;
          } else if (isPitchers) {
            pitchersCsv = csvContent;
          }
        }

        if (!hasFiles) {
          return reply.code(400).send({ error: "No files uploaded" });
        }

        // Ingest both files
        const result = await agent.ingest({
          battersCsv,
          pitchersCsv,
          asOfDate: today,
        });

        // Check if this upload completed the projections run (both batters + pitchers present)
        const updatedBatchRun = await db
          .selectFrom("projections_run")
          .select(["staleness"])
          .where("id", "=", result.projectionsRunId)
          .executeTakeFirst();
        const batchProjectionsNowFresh = updatedBatchRun?.staleness === "fresh";

        // Re-snapshot leagues: if projections are now fully fresh, re-snapshot all leagues
        // that have a snapshot today (not just degraded ones), to recompute projected standings
        // with complete projections data. If still partial, only re-snapshot degraded leagues.
        await triggerDegradedLeagueResnapshots(db, request.log, today, batchProjectionsNowFresh);

        return {
          projectionsRunId: result.projectionsRunId,
          batters: result.battersReport,
          pitchers: result.pitchersReport,
        };
      } catch (error) {
        request.log.error({ error }, "Batch projections upload failed");
        const errorMessage =
          error instanceof Error ? error.message : "Batch projections upload failed";
        return reply
          .code(500)
          .send({ error: "Batch projections upload failed", details: errorMessage });
      }
    },
  );

  // Get projections run
  app.get(
    "/api/projections/:runId",
    {
      onRequest: [authenticate],
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    async (
      request: any,
      reply: any,
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
    {
      onRequest: [authenticate],
      config: {
        rateLimit: {
          max: 100,
          timeWindow: "1 minute",
        },
      },
    },
    async (
      request: any,
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
