import type {
  Category,
  ScoringFormat,
  StatComponents,
} from "../../../shared/dist/index.js";
import type { RosteredPlayer } from "../projection/types.js";

// ─── Configuration ────────────────────────────────────────────────────────────

export interface SimulationConfig {
  /** Number of Monte Carlo simulation runs (default 500) */
  runs?: number;
  /** RNG seed for reproducibility (0 = Math.random, non-reproducible) */
  seed?: number;
  /** Disable stochastic sampling — returns deterministic expected values */
  deterministic?: boolean;
  /** Season end date */
  seasonEndDate?: string;
  /** Enable replacement/availability churn layer (Phase 106) */
  enableChurn?: boolean;
}

// ─── Phase 103: Canonical Simulation State ────────────────────────────────────

export interface TeamSimInput {
  teamId: number;
  teamName: string;
  /** Season-to-date batter components (actuals) */
  currentBatterComponents: StatComponents;
  /** Season-to-date pitcher components (actuals) */
  currentPitcherComponents: StatComponents;
  /** Rostered players with position eligibility and slot/status info */
  roster: RosteredPlayer[];
  /** Per-player full-season RoS projection components (pre-prorating) */
  playerProjections: Map<number, StatComponents>;
  /** GS used year-to-date (for GS cap enforcement) */
  gsUsed: number;
}

export interface SimulationState {
  leagueId: number;
  snapshotDate: string;
  projectionsRunId: number;
  categories: Category[];
  scoringFormat: ScoringFormat | null;
  rosterSlots: Record<string, number>;
  gsCap: number | null;
  projectionAsOfDate: string;
  seasonStartDate: string;
  seasonEndDate: string;
  /** Calendar days remaining in the regular season */
  daysRemaining: number;
  teams: TeamSimInput[];
  degradedReasons: string[];
  isViable: boolean;
}

// ─── Phase 104: Opportunity Streams ──────────────────────────────────────────

export interface PlayerOpportunity {
  playerId: number;
  /** Prorated RoS components (remaining-season expected totals) */
  rosComponents: StatComponents;
  activeSlot: string | null;
  positions: string[];
  isActive: boolean;
  /** True when in SP or P slot with GS starts (subject to GS cap) */
  isSP: boolean;
  /** Phase 106: fraction of remaining days expected to be available [0, 1] */
  availabilityRate: number;
}

export interface TeamOpportunityStream {
  teamId: number;
  hitters: PlayerOpportunity[];
  pitchers: PlayerOpportunity[];
  bench: PlayerOpportunity[];
  gsCapRemaining: number;
  daysRemaining: number;
}

// ─── Phase 105: Single-run Result ────────────────────────────────────────────

export interface TeamRunResult {
  teamId: number;
  /** Final season components (current actuals + simulated RoS) */
  batterComponents: StatComponents;
  pitcherComponents: StatComponents;
  /** Source breakdown (days of production) */
  sourceDays: { starter: number; bench: number; replacement: number };
}

export type LeagueRunResult = TeamRunResult[];

// ─── Phase 107: Monte Carlo Aggregate Outputs ────────────────────────────────

export interface TeamFinishDistribution {
  teamId: number;
  teamName: string;
  /** Mean roto points across all runs */
  projectedRotoPoints: number;
  rotoPointsP10: number;
  rotoPointsP50: number;
  rotoPointsP90: number;
  /** finishProbabilities[i] = P(rank == i+1) as a fraction in [0, 1] */
  finishProbabilities: number[];
  p1: number;
  pTop3: number;
  pTopHalf: number;
  /** Per-category median (p50) projected value */
  categoryP50: Record<string, number>;
  /** Per-category interquartile swing (p90 - p10) */
  categorySwing: Record<string, number>;
}

export interface MonteCarloResult {
  leagueId: number;
  snapshotDate: string;
  projectionsRunId: number;
  seed: number;
  runs: number;
  computedAt: string;
  teams: TeamFinishDistribution[];
  calibration: {
    /** Roto points from the deterministic baseline run */
    deterministicRotoPoints: Record<number, number>;
  };
}

// ─── Phase 108: Scenario Evaluation ──────────────────────────────────────────

import type { RosterGap } from "../projection/types.js";

/**
 * Waiver add/drop mutation applied against canonical SimulationState.
 * addPlayerProjection must be supplied for free agents not yet in state.
 */
export interface WaiverMutation {
  type: "waiver";
  teamId: number;
  addPlayerId: number;
  dropPlayerId: number;
  addPlayerPositions: string[];
  addPlayerProjection?: StatComponents;
}

/**
 * Bilateral trade mutation applied against canonical SimulationState.
 * Both teams' players must already exist in state.teams.
 */
export interface TradeMutation {
  type: "trade";
  userTeamId: number;
  partnerTeamId: number;
  givePlayerIds: number[];
  receivePlayerIds: number[];
}

export type ScenarioMutation = WaiverMutation | TradeMutation;

/** Per-category roto delta (categoryId → delta points). */
export type CategoryDeltaMap = Record<string, number>;

/** Result returned by evaluateDeterministicScenario. */
export interface ScenarioEvaluationResult {
  /** Whether the post-mutation roster can fill all required starting slots. */
  isLegal: boolean;
  /** Human-readable blocking issues (e.g. unfillable slot descriptions). */
  blockingIssues: string[];
  /** Roster gaps detected by the allocator on the mutated team. */
  gaps: RosterGap[];
  /** Delta roto points for the requesting team (positive = better). */
  deltaOverallPoints: number;
  /** Per-category delta roto points for the requesting team. */
  categoryDeltas: CategoryDeltaMap;
  /** Delta roto points for the trade partner team (trade mutations only). */
  partnerDeltaOverallPoints?: number;
  /** Per-category delta roto points for the trade partner team. */
  partnerCategoryDeltas?: CategoryDeltaMap;
  /** Degradation notes accumulated during evaluation. */
  degradedReasons: string[];
}
