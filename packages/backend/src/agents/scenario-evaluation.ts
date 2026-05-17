/**
 * Phase 108: ScenarioEvaluationAgent
 *
 * Shared backend entry point for deterministic waiver and trade scenario scoring.
 * Backed by pure simulation helpers from scenario-evaluator.ts.
 *
 * Responsibilities:
 * - Load snapshot-bound SimulationState (via SeasonSimulationAgent.buildState)
 * - Resolve projections for free-agent players not yet in state
 * - Delegate deterministic scoring to evaluateDeterministicScenario
 * - Cache baseline state for repeated scenario calls on the same snapshot
 *
 * Does NOT own: Monte Carlo reranking, candidate enumeration, response shaping.
 * Those responsibilities belong to TradeRecommendationAgent and WaiverRecommendationAgent.
 */

import type { Kysely } from "kysely";
import type { BaseLogger } from "pino";
import type { Database } from "../db/schema.js";
import type { StatComponents } from "../../../shared/dist/index.js";
import { SeasonSimulationAgent } from "./season-simulation.js";
import { evaluateDeterministicScenario } from "../simulation/scenario-evaluator.js";
import type {
  SimulationState,
  ScenarioMutation,
  WaiverMutation,
  TradeMutation,
  ScenarioEvaluationResult,
} from "../simulation/types.js";

export type { ScenarioEvaluationResult, ScenarioMutation };

export interface WaiverEvaluationInput {
  leagueId: number;
  teamId: number;
  snapshotDate: string;
  projectionsRunId: number;
  addPlayerId: number;
  dropPlayerId: number;
}

export interface TradeEvaluationInput {
  leagueId: number;
  userTeamId: number;
  partnerTeamId: number;
  snapshotDate: string;
  projectionsRunId: number;
  givePlayerIds: number[];
  receivePlayerIds: number[];
}

export class ScenarioEvaluationAgent {
  private readonly seasonAgent: SeasonSimulationAgent;

  constructor(
    private readonly db: Kysely<Database>,
    private readonly logger?: BaseLogger,
  ) {
    this.seasonAgent = new SeasonSimulationAgent(db, logger);
  }

  /**
   * Evaluate a waiver add/drop scenario deterministically.
   *
   * Loads the snapshot-bound SimulationState and resolves projections for the
   * added free-agent player before delegating to the pure evaluator.
   */
  async evaluateWaiver(
    input: WaiverEvaluationInput,
  ): Promise<ScenarioEvaluationResult> {
    const state = await this.loadState(
      input.leagueId,
      input.snapshotDate,
      input.projectionsRunId,
    );

    // Resolve positions and projections for the added player
    const [addPlayerRow, addPlayerProjection] = await Promise.all([
      this.db
        .selectFrom("player")
        .select(["id", "positions"])
        .where("id", "=", input.addPlayerId)
        .executeTakeFirst(),
      this.loadPlayerProjection(input.projectionsRunId, input.addPlayerId),
    ]);

    const addPlayerPositions = (addPlayerRow?.positions as string[]) ?? [];

    const mutation: WaiverMutation = {
      type: "waiver",
      teamId: input.teamId,
      addPlayerId: input.addPlayerId,
      dropPlayerId: input.dropPlayerId,
      addPlayerPositions,
      addPlayerProjection: addPlayerProjection ?? undefined,
    };

    this.logger?.debug(
      { leagueId: input.leagueId, teamId: input.teamId, addPlayerId: input.addPlayerId, dropPlayerId: input.dropPlayerId },
      "Evaluating waiver scenario deterministically",
    );

    return evaluateDeterministicScenario(state, mutation);
  }

  /**
   * Evaluate a bilateral trade scenario deterministically.
   *
   * Both teams' players must already be in the SimulationState (they are
   * rostered players). No extra projection loading required for trades.
   */
  async evaluateTrade(
    input: TradeEvaluationInput,
  ): Promise<ScenarioEvaluationResult> {
    const state = await this.loadState(
      input.leagueId,
      input.snapshotDate,
      input.projectionsRunId,
    );

    const mutation: TradeMutation = {
      type: "trade",
      userTeamId: input.userTeamId,
      partnerTeamId: input.partnerTeamId,
      givePlayerIds: input.givePlayerIds,
      receivePlayerIds: input.receivePlayerIds,
    };

    this.logger?.debug(
      {
        leagueId: input.leagueId,
        userTeamId: input.userTeamId,
        partnerTeamId: input.partnerTeamId,
        givePlayerIds: input.givePlayerIds,
        receivePlayerIds: input.receivePlayerIds,
      },
      "Evaluating trade scenario deterministically",
    );

    return evaluateDeterministicScenario(state, mutation);
  }

  /**
   * Evaluate an arbitrary ScenarioMutation directly.
   * Useful when the caller has already constructed the mutation object.
   * State must be pre-loaded by the caller.
   */
  evaluateFromState(
    state: SimulationState,
    mutation: ScenarioMutation,
  ): ScenarioEvaluationResult {
    return evaluateDeterministicScenario(state, mutation);
  }

  /**
   * Load snapshot-bound SimulationState.
   * Delegates to SeasonSimulationAgent.buildState (Phase 103 canonical builder).
   */
  async loadState(
    leagueId: number,
    snapshotDate: string,
    projectionsRunId: number,
  ): Promise<SimulationState> {
    return this.seasonAgent.buildState(leagueId, snapshotDate, projectionsRunId);
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async loadPlayerProjection(
    projectionsRunId: number,
    playerId: number,
  ): Promise<StatComponents | null> {
    const row = await this.db
      .selectFrom("player_projection")
      .select(["stat_components_json"])
      .where("projections_run_id", "=", projectionsRunId)
      .where("player_id", "=", playerId)
      .executeTakeFirst();

    return row ? (row.stat_components_json as StatComponents) : null;
  }
}
