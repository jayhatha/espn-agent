import { type Job } from "bullmq";
import pino from "pino";
import { getDb } from "../db/connection.js";
import { SnapshotOrchestratorAgent } from "../agents/snapshot-orchestrator.js";
import { getEspnAuthFromEnv } from "../utils/espn-env.js";
import { createRedisConnection, createQueue, createWorker, registerShutdown } from "./worker-runtime.js";

// Import backfill worker so it runs in the same process
import "./backfill-worker.js";

// Import live poll worker so it runs in the same process (scheduling is gated by LIVE_POLL_ENABLED)
import { scheduleLivePolls } from "./live-poll-worker.js";

/**
 * Background worker for daily snapshot jobs
 * Per AGENTS.md §8
 */

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

const connection = createRedisConnection();

// Create queue and DLQ
export const snapshotQueue = createQueue("snapshots", connection);
export const snapshotDLQ = createQueue("snapshots-dlq", connection);

interface SnapshotJobData {
  leagueId: number;
  snapshotDate: string;
  auth?: {
    SWID?: string;
    espn_s2?: string;
  };
}

// Worker
const worker = createWorker<SnapshotJobData>(
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
        espnAuth: auth || getEspnAuthFromEnv(),
      });

      logger.info({ jobId: job.id, leagueId }, "Snapshot job completed");
      return { success: true };
    } catch (error) {
      logger.error({ error, jobId: job.id, leagueId }, "Snapshot job failed");
      throw error;
    }
  },
  { concurrency: 3 },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Job completed");
});

worker.on("failed", async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    // Max retries exceeded - move to DLQ
    logger.warn({ jobId: job.id }, "Max retries exceeded - moving to DLQ");

    await snapshotDLQ.add(
      "failed-snapshot",
      {
        originalJobId: job.id,
        originalJobName: job.name,
        originalData: job.data,
        errorMessage: err.message,
        errorStack: err.stack,
        attemptsMade: job.attemptsMade,
        failedAt: new Date().toISOString(),
      },
      {
        removeOnComplete: { age: 86400 * 7 }, // Keep 7 days for analysis
      },
    );

    logger.error({ jobId: job.id, error: err }, "Job moved to DLQ");
  } else {
    logger.error({ jobId: job?.id, error: err }, "Job failed");
  }
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

/**
 * Inspect DLQ for failed jobs (for admin debugging)
 */
export async function inspectDLQ(limit = 10) {
  const failed = await snapshotDLQ.getJobs(["completed"], 0, limit);
  return failed.map((job) => ({
    jobId: job.data.originalJobId,
    failedAt: job.data.failedAt,
    error: job.data.errorMessage,
    attempts: job.data.attemptsMade,
  }));
}

// Graceful shutdown
registerShutdown([worker], [connection], logger);

logger.info("Worker started");

// Schedule both daily snapshots and live polls on startup
scheduleDailySnapshots().catch((err) =>
  logger.error({ err }, "Failed to schedule daily snapshots"),
);
scheduleLivePolls().catch((err) =>
  logger.error({ err }, "Failed to schedule live polls"),
);
