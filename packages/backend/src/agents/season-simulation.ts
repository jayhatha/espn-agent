import type { Kysely } from "kysely";
import type { BaseLogger } from "pino";
import type { Database } from "../db/schema.js";
import { buildSimulationState } from "../simulation/state-builder.js";
import { runMonteCarlo } from "../simulation/monte-carlo.js";
import type {
  SimulationConfig,
  MonteCarloResult,
  SimulationState,
} from "../simulation/types.js";

/**
 * SeasonSimulationAgent (Phase 107)
 *
 * Orchestrates the Monte Carlo simulation pipeline:
 *   Phase 103 → buildState() (canonical simulation state)
 *   Phases 104-107 → runSimulation() (opportunity → constraint → churn → MC)
 *
 * Results are consumable by backend APIs and reusable by add/drop and trade
 * scenario evaluators without route-specific recomputation (MC-02).
 */
export class SeasonSimulationAgent {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger?: BaseLogger,
  ) {}

  /**
   * Build canonical simulation state from DB (SIM-01).
   * Can be reused across multiple simulation requests for the same snapshot.
   */
  async buildState(
    leagueId: number,
    snapshotDate: string,
    projectionsRunId: number,
  ): Promise<SimulationState> {
    return buildSimulationState(
      this.db,
      leagueId,
      snapshotDate,
      projectionsRunId,
      this.logger,
    );
  }

  /**
   * Run the full Monte Carlo simulation pipeline (Phases 104-107).
   * Proceeds with degraded inputs where possible; logs a warning when state
   * is not fully viable but does not throw (never fabricates data).
   */
  async runSimulation(
    leagueId: number,
    snapshotDate: string,
    projectionsRunId: number,
    config?: SimulationConfig,
  ): Promise<MonteCarloResult> {
    const state = await this.buildState(
      leagueId,
      snapshotDate,
      projectionsRunId,
    );

    if (!state.isViable) {
      this.logger?.warn(
        { leagueId, snapshotDate, degradedReasons: state.degradedReasons },
        "Simulation state not viable — running with degraded inputs",
      );
    }

    this.logger?.info(
      { leagueId, snapshotDate, projectionsRunId, config },
      "Starting Monte Carlo simulation",
    );

    const result = runMonteCarlo(state, config);

    this.logger?.info(
      { leagueId, snapshotDate, runs: result.runs, teams: result.teams.length },
      "Monte Carlo simulation complete",
    );

    return result;
  }
}
