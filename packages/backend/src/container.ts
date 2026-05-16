import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";
import type { BaseLogger } from "pino";
import type { Database } from "./db/schema.js";
import { ESPNAdapter } from "./adapters/espn.js";
import { PitcherlistAdapter } from "./adapters/pitcherlist.js";
import { AdvancedStatsAdapter } from "./adapters/advanced-stats.js";
import { DraftRankingsAgent } from "./agents/draft-rankings.js";
import { FaabTrackerAgent } from "./agents/faab-tracker.js";
import { GsPacingAgent } from "./agents/gs-pacing.js";
import { TradeRecommendationAgent } from "./agents/trade-recommendation.js";
import { TransactionImpactAgent } from "./agents/transaction-impact.js";

export interface Container {
  adapters: {
    espn: ESPNAdapter;
    pitcherlist: PitcherlistAdapter;
    advancedStats: AdvancedStatsAdapter;
  };
  agents: {
    draftRankings: (db: Kysely<Database>, log: BaseLogger) => DraftRankingsAgent;
    faabTracker: (db: Kysely<Database>, log: BaseLogger) => FaabTrackerAgent;
    gsPacing: (db: Kysely<Database>, log: BaseLogger) => GsPacingAgent;
    tradeRecommendation: (db: Kysely<Database>, log: BaseLogger) => TradeRecommendationAgent;
    transactionImpact: (db: Kysely<Database>, log: BaseLogger) => TransactionImpactAgent;
  };
}

declare module "fastify" {
  interface FastifyInstance {
    container: Container;
  }
}

/**
 * Decorates `fastify.container` with process-scope adapter singletons and
 * request-scope agent factory functions. Call once on the root server instance
 * before registering route plugins.
 */
export function setupContainer(fastify: FastifyInstance): void {
  const espn = new ESPNAdapter(fastify.log);
  const pitcherlist = new PitcherlistAdapter(fastify.log);
  const advancedStats = new AdvancedStatsAdapter(fastify.log);

  const container: Container = {
    adapters: { espn, pitcherlist, advancedStats },
    agents: {
      draftRankings: (db, log) => new DraftRankingsAgent(db, log),
      faabTracker: (db, log) => new FaabTrackerAgent(db, log),
      gsPacing: (db, log) => new GsPacingAgent(db, log),
      tradeRecommendation: (db, log) => new TradeRecommendationAgent(db, log),
      transactionImpact: (db, log) => new TransactionImpactAgent(db, log),
    },
  };

  fastify.decorate("container", container);
}
