import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { SnapshotOrchestratorAgent } from "./snapshot-orchestrator.js";
import { WaiverRecommendationAgent } from "./waiver-recommendation.js";
import { TradeRecommendationAgent } from "./trade-recommendation.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { ProjectionsIngestAgent } from "./projections-ingest.js";
import { ESPNAdapter } from "../adapters/espn.js";

/**
 * Centralized agent construction.
 * Routes and workers call these functions instead of newing agents directly —
 * so adding a new dependency requires editing only this file.
 */

export function createSnapshotOrchestrator(
  db: Kysely<Database>,
  logger?: BaseLogger,
): SnapshotOrchestratorAgent {
  return new SnapshotOrchestratorAgent(db, logger);
}

export function createStandingsAgent(
  db: Kysely<Database>,
  logger?: BaseLogger,
): StandingsProjectionAgent {
  return new StandingsProjectionAgent(db, logger);
}

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

export function createTradeAgent(
  db: Kysely<Database>,
  logger?: BaseLogger,
): TradeRecommendationAgent {
  return new TradeRecommendationAgent(db, logger);
}

export function createProjectionsIngestAgent(
  db: Kysely<Database>,
  logger?: BaseLogger,
): ProjectionsIngestAgent {
  return new ProjectionsIngestAgent(db, logger);
}
