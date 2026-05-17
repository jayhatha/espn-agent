import type { FastifyInstance } from "fastify";
import { getDb } from "../db/connection.js";
import { authenticate } from "../middleware/auth.js";
import { SeasonSimulationAgent } from "../agents/season-simulation.js";
import type { SimulationConfig } from "../simulation/types.js";

/**
 * Simulation API Routes (Phase 107)
 *
 * POST /api/leagues/:leagueId/simulation/run
 *   Runs the Monte Carlo simulation for a league snapshot.
 *   Returns per-team finish distributions, roto-point intervals, and
 *   category swing ranges (MC-01).
 *
 * GET /api/leagues/:leagueId/simulation/state
 *   Returns the canonical simulation state without running MC —
 *   useful for debugging and verifying input completeness.
 */
export async function simulationRoutes(app: FastifyInstance) {
  const db = getDb();

  async function getLatestProjectionsRunId(): Promise<number | null> {
    const run = await db
      .selectFrom("projections_run")
      .select(["id"])
      .where("staleness", "=", "fresh")
      .orderBy("as_of_date", "desc")
      .executeTakeFirst();
    return run?.id ?? null;
  }

  async function getLatestSnapshotDate(leagueId: number): Promise<string | null> {
    const snapshot = await db
      .selectFrom("league_daily_snapshot")
      .select(["snapshot_date"])
      .where("league_id", "=", leagueId)
      .orderBy("snapshot_date", "desc")
      .executeTakeFirst();
    return (snapshot?.snapshot_date as string) ?? null;
  }

  // ── POST /api/leagues/:leagueId/simulation/run ────────────────────────────

  app.post<{
    Params: { leagueId: string };
    Body: {
      snapshotDate?: string;
      projectionsRunId?: number;
      runs?: number;
      seed?: number;
      deterministic?: boolean;
      enableChurn?: boolean;
    };
  }>(
    "/api/leagues/:leagueId/simulation/run",
    { onRequest: [authenticate] },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      if (isNaN(leagueId)) {
        return reply.code(400).send({ error: "Invalid leagueId" });
      }

      const {
        snapshotDate: bodyDate,
        projectionsRunId: bodyRunId,
        runs,
        seed,
        deterministic,
        enableChurn,
      } = request.body ?? {};

      const snapshotDate = bodyDate ?? (await getLatestSnapshotDate(leagueId));
      if (!snapshotDate) {
        return reply
          .code(404)
          .send({ error: "No snapshot found for this league" });
      }

      const projectionsRunId =
        bodyRunId ?? (await getLatestProjectionsRunId());
      if (!projectionsRunId) {
        return reply
          .code(404)
          .send({ error: "No fresh projections run found" });
      }

      const config: SimulationConfig = {
        runs,
        seed,
        deterministic,
        enableChurn,
      };

      const agent = new SeasonSimulationAgent(db, request.log);
      try {
        const result = await agent.runSimulation(
          leagueId,
          snapshotDate,
          projectionsRunId,
          config,
        );
        return reply.code(200).send(result);
      } catch (err) {
        request.log.error(
          { err, leagueId, snapshotDate },
          "Simulation failed",
        );
        return reply.code(500).send({ error: "Simulation failed" });
      }
    },
  );

  // ── GET /api/leagues/:leagueId/simulation/state ───────────────────────────

  app.get<{
    Params: { leagueId: string };
    Querystring: { snapshotDate?: string; projectionsRunId?: string };
  }>(
    "/api/leagues/:leagueId/simulation/state",
    { onRequest: [authenticate] },
    async (request, reply) => {
      const leagueId = parseInt(request.params.leagueId, 10);
      if (isNaN(leagueId)) {
        return reply.code(400).send({ error: "Invalid leagueId" });
      }

      const snapshotDate =
        request.query.snapshotDate ??
        (await getLatestSnapshotDate(leagueId));
      if (!snapshotDate) {
        return reply
          .code(404)
          .send({ error: "No snapshot found for this league" });
      }

      const projectionsRunId = request.query.projectionsRunId
        ? parseInt(request.query.projectionsRunId, 10)
        : (await getLatestProjectionsRunId());
      if (!projectionsRunId) {
        return reply
          .code(404)
          .send({ error: "No fresh projections run found" });
      }

      const agent = new SeasonSimulationAgent(db, request.log);
      const state = await agent.buildState(
        leagueId,
        snapshotDate,
        projectionsRunId,
      );

      // Return serialisable summary (Maps serialise as {} in JSON)
      return reply.code(200).send({
        leagueId: state.leagueId,
        snapshotDate: state.snapshotDate,
        projectionsRunId: state.projectionsRunId,
        categories: state.categories,
        gsCap: state.gsCap,
        daysRemaining: state.daysRemaining,
        degradedReasons: state.degradedReasons,
        isViable: state.isViable,
        teamCount: state.teams.length,
        teams: state.teams.map((t) => ({
          teamId: t.teamId,
          teamName: t.teamName,
          gsUsed: t.gsUsed,
          rosterSize: t.roster.length,
          projectionsCount: t.playerProjections.size,
        })),
      });
    },
  );
}
