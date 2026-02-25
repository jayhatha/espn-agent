import cron from "node-cron";
import pino from "pino";
import { getDb } from "../db/connection.js";
import { PlayerPoolSyncAgent } from "../agents/player-pool-sync.js";
import { ESPNAdapter } from "../adapters/espn.js";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  name: "player-pool-worker",
});

const CURRENT_SEASON = 2025; // Update annually or read from env var

// Schedule daily at 4:00 AM Eastern Time
cron.schedule(
  "0 4 * * *",
  async () => {
    logger.info("Starting daily player pool sync");
    const startTime = Date.now();

    try {
      const db = getDb();
      const espnAdapter = new ESPNAdapter(logger);
      const syncAgent = new PlayerPoolSyncAgent(db, espnAdapter, logger);

      const result = await syncAgent.syncPlayerPool(CURRENT_SEASON);

      if (result.success) {
        const duration = Date.now() - startTime;
        logger.info(
          {
            playersUpdated: result.playersUpdated,
            playersInserted: result.playersInserted,
            durationMs: duration,
          },
          "Player pool sync completed successfully"
        );
      } else {
        logger.error({ error: result.error }, "Player pool sync failed");
      }
    } catch (error) {
      logger.error({ error }, "Player pool sync crashed");
    }
  },
  {
    timezone: "America/New_York", // ESPN updates typically overnight Eastern
  }
);

logger.info("Player pool sync cron job scheduled (4:00 AM ET daily)");

// Keep process alive
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});
