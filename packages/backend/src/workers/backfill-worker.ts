import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { getDb } from "../db/connection.js";
import { HistoricalBackfillAgent, type BackfillProgress } from "../agents/historical-backfill.js";

/**
 * Background worker for historical backfill jobs
 * Per Phase 07 PLAN.md
 */

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  },
);

// Create queue for backfills (separate from snapshot queue)
export const backfillQueue = new Queue("backfills", { connection } as any);

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
const worker = new Worker<BackfillJobData>(
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
        espnAuth,
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
  {
    connection: connection as any,
    concurrency: 1, // One backfill at a time to respect rate limits
  },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Backfill job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err }, "Backfill job failed");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, closing backfill worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

logger.info("Backfill worker started");
