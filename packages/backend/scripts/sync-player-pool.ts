import { getDb } from "../src/db/connection.js";
import { ESPNAdapter } from "../src/adapters/espn.js";
import { PlayerPoolSyncAgent } from "../src/agents/player-pool-sync.js";
import pino from "pino";

const logger = pino({ level: "info" });
const db = getDb();
const espnAdapter = new ESPNAdapter(logger);
const syncAgent = new PlayerPoolSyncAgent(db, espnAdapter, logger);

const season = parseInt(process.argv[2] || "2025", 10);

console.log(`\nSyncing player pool for ${season} season...\n`);

syncAgent.syncPlayerPool(season)
  .then((result) => {
    console.log("\n✓ Sync complete:", result);
    process.exit(result.success ? 0 : 1);
  })
  .catch((error) => {
    console.error("\n✗ Sync failed:", error);
    process.exit(1);
  });
