import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { getDb } from "../db/connection.js";
import { SnapshotOrchestratorAgent } from "../agents/snapshot-orchestrator.js";

/**
 * Background worker for daily snapshot jobs
 * Per AGENTS.md §8
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

// Create queue
export const snapshotQueue = new Queue("snapshots", { connection });

interface SnapshotJobData {
  leagueId: number;
  snapshotDate: string;
  auth?: {
    SWID?: string;
    espn_s2?: string;
  };
}

// Worker
const worker = new Worker<SnapshotJobData>(
  "snapshots",
  async (job: Job<SnapshotJobData>) => {
    const { leagueId, snapshotDate, auth } = job.data;

    logger.info(
      { jobId: job.id, leagueId, snapshotDate },
      "Processing snapshot job",
    );

    const db = getDb();
    const orchestrator = new SnapshotOrchestratorAgent(db, logger);

    try {
      await orchestrator.executeSnapshot({
        leagueId,
        snapshotDate,
        espnAuth: auth,
      });

      logger.info({ jobId: job.id, leagueId }, "Snapshot job completed");
      return { success: true };
    } catch (error) {
      logger.error({ error, jobId: job.id, leagueId }, "Snapshot job failed");
      throw error;
    }
  },
  { connection },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, error: err }, "Job failed");
});

// Schedule daily snapshots at 03:00 league timezone
export async function scheduleDailySnapshots() {
  const db = getDb();

  // Get all leagues
  const leagues = await db.selectFrom("league").selectAll().execute();

  const today = new Date().toISOString().split("T")[0];

  for (const league of leagues) {
    const jobId = `snapshot-${league.id}-${today}`;
    const job = await snapshotQueue.add(
      `snapshot-${league.id}-${today}`,
      {
        leagueId: league.id,
        snapshotDate: today,
      },
      {
        jobId,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000, // 5s base delay (5s, 10s, 20s with exponential backoff)
        },
        // Deduplication: prevent duplicate jobs for same league+date within 24 hours
        removeOnComplete: {
          age: 86400, // Keep completed jobs for 24 hours (in seconds)
        },
        removeOnFail: {
          age: 86400, // Keep failed jobs for 24 hours (in seconds)
        },
      },
    );

    if (job) {
      logger.info(
        { leagueId: league.id, snapshotDate: today, jobId },
        "Scheduled snapshot job",
      );
    } else {
      logger.info(
        { leagueId: league.id, snapshotDate: today, jobId },
        "Snapshot job already exists (deduplication)",
      );
    }
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, closing worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

logger.info("Worker started");
