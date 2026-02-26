import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { getDb } from "../db/connection.js";
import { PlayerPoolSyncAgent } from "../agents/player-pool-sync.js";
import { ESPNAdapter } from "../adapters/espn.js";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  name: "player-pool-worker",
});

const CURRENT_SEASON = 2025; // Update annually or read from env var

const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  },
);

// Create queue for player pool sync jobs
export const playerPoolQueue = new Queue("player-pool-sync", {
  connection: connection as any,
});

// Schedule daily job at 4:00 AM ET
playerPoolQueue
  .add(
    "daily-sync",
    { season: CURRENT_SEASON },
    {
      repeat: {
        pattern: "0 4 * * *", // 4 AM daily
        tz: "America/New_York",
      },
      removeOnComplete: { age: 86400 * 7 }, // Keep 7 days
      removeOnFail: { age: 86400 * 30 }, // Keep failures 30 days
    },
  )
  .then(() => {
    logger.info("Player pool sync scheduled (4:00 AM ET daily)");
  })
  .catch((err) => {
    logger.error({ error: err }, "Failed to schedule player pool sync");
  });

interface PlayerPoolJobData {
  season: number;
}

// Worker to process sync jobs
const worker = new Worker<PlayerPoolJobData>(
  "player-pool-sync",
  async (job: Job<PlayerPoolJobData>) => {
    const { season } = job.data;

    logger.info({ jobId: job.id, season }, "Starting player pool sync");
    const startTime = Date.now();

    try {
      const db = getDb();
      const espnAdapter = new ESPNAdapter(logger);
      const syncAgent = new PlayerPoolSyncAgent(db, espnAdapter, logger);

      const result = await syncAgent.syncPlayerPool(season);

      if (result.success) {
        const duration = Date.now() - startTime;
        logger.info(
          {
            playersUpdated: result.playersUpdated,
            playersInserted: result.playersInserted,
            durationMs: duration,
            jobId: job.id,
          },
          "Player pool sync completed successfully",
        );
        return {
          success: true,
          playersUpdated: result.playersUpdated,
          playersInserted: result.playersInserted,
          duration,
        };
      } else {
        logger.error({ error: result.error, jobId: job.id }, "Player pool sync failed");
        throw new Error(result.error || "Unknown sync error");
      }
    } catch (error) {
      logger.error({ error, jobId: job.id }, "Player pool sync crashed");
      throw error;
    }
  },
  {
    connection: connection as any,
  },
);

// Event listeners
worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Player pool sync job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err }, "Player pool sync job failed");
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down player pool worker");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down player pool worker");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

logger.info("Player pool worker started");
