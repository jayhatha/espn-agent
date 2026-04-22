import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import pino from "pino";
import { getDb } from "../db/connection.js";
import { LivePollAgent } from "../agents/live-poll.js";

/**
 * Live Poll Worker
 * Per Phase 82: BullMQ repeatable job (every 15 min) that refreshes
 * standings from ESPN during MLB game hours (1pm–midnight ET).
 *
 * Enabled via LIVE_POLL_ENABLED=true env var.
 * Game-window check is inside the job so the queue entry always exists.
 */

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);

export const livePollQueue = new Queue("live-polls", {
  connection: connection as any,
});

interface LivePollJobData {
  leagueId: number;
}

const worker = new Worker<LivePollJobData>(
  "live-polls",
  async (job: Job<LivePollJobData>) => {
    if (process.env.LIVE_POLL_ENABLED !== "true") {
      return { skipped: true, reason: "LIVE_POLL_ENABLED not set" };
    }
    if (!LivePollAgent.isGameWindow()) {
      logger.debug({ jobId: job.id }, "live-poll: outside game window, skipping");
      return { skipped: true, reason: "not in game window" };
    }

    const { leagueId } = job.data;
    const today = new Date().toISOString().split("T")[0];
    const db = getDb();
    const agent = new LivePollAgent(db, logger);

    logger.info({ leagueId, today }, "live-poll: refreshing standings");
    const eventCount = await agent.refresh(leagueId, today);
    return { leagueId, today, eventCount };
  },
  { connection: connection as any, concurrency: 2 },
);

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "live-poll job failed");
});

/**
 * Register a 15-minute repeatable poll for each active league.
 * Safe to call multiple times — BullMQ deduplicates by jobId.
 */
export async function scheduleLivePolls(): Promise<void> {
  if (process.env.LIVE_POLL_ENABLED !== "true") {
    logger.info("LIVE_POLL_ENABLED not set — live poll scheduling skipped");
    return;
  }

  const db = getDb();
  const leagues = await db.selectFrom("league").select("id").execute();

  for (const league of leagues) {
    const jobId = `live-poll-${league.id}`;
    await livePollQueue.add(
      jobId,
      { leagueId: league.id },
      {
        jobId,
        repeat: { pattern: "*/15 * * * *" },
        removeOnComplete: { count: 5 },
        removeOnFail: { count: 10 },
      },
    );
    logger.info({ leagueId: league.id }, "live poll job scheduled");
  }
}
