import type { BaseLogger } from "pino";
import type { Kysely } from "kysely";
import type { Database } from "../db/schema.js";
import { WaiverRecommendationAgent } from "./waiver-recommendation.js";
import { StandingsProjectionAgent } from "./standings-projection.js";
import { ESPNAdapter } from "../adapters/espn.js";
import { ScenarioEvaluationAgent } from "./scenario-evaluation.js";

/**
 * Centralized agent construction for agents that require non-trivial DI wiring.
 * Simple agents (SnapshotOrchestratorAgent, TradeRecommendationAgent, etc.) should be
 * instantiated directly with `new AgentClass(db, logger)` at the call site.
 */

/**
 * Creates a ScenarioEvaluationAgent (Phase 108 shared evaluator).
 * Callers may reuse the same instance across trade and waiver agents.
 */
export function createScenarioEvaluationAgent(
  db: Kysely<Database>,
  logger?: BaseLogger,
): ScenarioEvaluationAgent {
  return new ScenarioEvaluationAgent(db, logger);
}

/**
 * Creates a WaiverRecommendationAgent wired with its own StandingsProjectionAgent
 * and the Phase 108 ScenarioEvaluationAgent for exact legality and scoring.
 * Pass an existing ESPNAdapter to preserve singleton cache across requests.
 */
export function createWaiverAgent(
  db: Kysely<Database>,
  logger?: BaseLogger,
  espnAdapter?: ESPNAdapter,
  scenarioAgent?: ScenarioEvaluationAgent,
): WaiverRecommendationAgent {
  const adapter = espnAdapter ?? new ESPNAdapter(logger);
  const standingsAgent = new StandingsProjectionAgent(db, logger);
  const scenario = scenarioAgent ?? createScenarioEvaluationAgent(db, logger);
  return new WaiverRecommendationAgent(
    db,
    standingsAgent,
    adapter,
    logger,
    scenario,
  );
}
