import { type Job } from "bullmq";
import pino from "pino";
import { getDb } from "../db/connection.js";
import { HistoricalBackfillAgent, type BackfillProgress } from "../agents/historical-backfill.js";
import { getEspnAuthFromEnv } from "../utils/espn-env.js";
import { createRedisConnection, createQueue, createWorker, registerShutdown } from "./worker-runtime.js";

/**
 * Background worker for historical backfill jobs
 * Per Phase 07 PLAN.md
 */

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const connection = createRedisConnection();

// Create queue for backfills (separate from snapshot queue)
export const backfillQueue = createQueue("backfills", connection);

export interface BackfillJobData {
  leagueId: number;
  season: number;
  startWeek: number;
  endWeek: number;
  espnAuth?: {
    SWID?: string;
    espn_s2?: string;
  };
}

// Worker - processes backfill jobs
const worker = createWorker<BackfillJobData>(
  "backfills",
  async (job: Job<BackfillJobData>) => {
    const { leagueId, season, startWeek, endWeek, espnAuth } = job.data;

    logger.info(
      { jobId: job.id, leagueId, season, startWeek, endWeek },
      "Processing backfill job",
    );

    const db = getDb();
    const agent = new HistoricalBackfillAgent(db, logger);

    try {
      // Call backfillSeason with progress callback
      const result = await agent.backfillSeason({
        leagueId,
        season,
        startWeek,
        endWeek,
        espnAuth: espnAuth || getEspnAuthFromEnv(),
        onProgress: async (progress: BackfillProgress) => {
          // Update job progress in Redis (visible via API)
          await job.updateProgress(progress);
          logger.info(
            {
              jobId: job.id,
              leagueId,
              stage: progress.stage,
              percentage: progress.percentage,
              currentWeek: progress.currentWeek,
            },
            "Backfill progress update",
          );
        },
      });

      logger.info({ jobId: job.id, leagueId, result }, "Backfill job completed");
      return result;
    } catch (error) {
      logger.error({ error, jobId: job.id, leagueId }, "Backfill job failed");
      throw error;
    }
  },
  connection,
  { concurrency: 1 },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Backfill job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err }, "Backfill job failed");
});

// Graceful shutdown
registerShutdown([worker], [connection], logger);

logger.info("Backfill worker started");
