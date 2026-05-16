import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { WaiverRecommendationAgent } from "./waiver-recommendation.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { ESPNAdapter } from "../adapters/espn.js";

/**
 * Centralized agent construction for agents that require non-trivial DI wiring.
 * Simple agents (SnapshotOrchestratorAgent, TradeRecommendationAgent, etc.) should be
 * instantiated directly with `new AgentClass(db, logger)` at the call site.
 */

/**
 * Creates a WaiverRecommendationAgent wired with its own StandingsProjectionAgent.
 * Pass an existing ESPNAdapter to preserve singleton cache across requests.
 */
export function createWaiverAgent(
  db: Kysely<Database>,
  logger?: BaseLogger,
  espnAdapter?: ESPNAdapter,
): WaiverRecommendationAgent {
  const adapter = espnAdapter ?? new ESPNAdapter(logger);
  const standingsAgent = new StandingsProjectionAgent(db, logger);
  return new WaiverRecommendationAgent(db, standingsAgent, adapter, logger);
}
