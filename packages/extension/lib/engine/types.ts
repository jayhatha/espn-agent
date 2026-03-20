import type { DraftPick, DraftedPlayer, DraftRanking, AuctionValue, Category } from "@espn-fantasy/shared";

// ============================================================
// SGP / Roster Optimizer shared types
// ============================================================

/** A player record merged from FG projection + auction value, ready for SGP/optimizer computation */
export interface PoolPlayer {
  name: string;
  normalizedName: string;
  dollars: number;
  isPitcher: boolean;
  positions: string[];  // From FG auction pos field, split on "/"
  stats: Record<string, number>;
  /** ESPN average salary (scraped from DOM). When present, used by nomination strategy to compute overpricing. */
  espnAvgSalary?: number;
}

export interface CategoryStats {
  mean: number;
  std: number;
  replacementValue: number;
}

export interface SGPVectors {
  statVectors: Record<string, number[]>;
  categoryStats: Record<string, CategoryStats>;
  playerSGPs: number[];
  computedAt: number;
}

/** Result from the greedy knapsack roster optimizer */
export interface RosterOptimizationResult {
  roster: PoolPlayer[];
  slotAssignments: string[];      // Parallel to roster — which slot each player fills
  totalSGPValue: number;
  budgetUsed: number;
  unfilledSlots: number;
}

export interface InflationSignal {
  inflationFactor: number;       // Clamped 0.5-2.0
  rawInflationFactor: number;    // Unclamped for debugging
  totalRemainingBudget: number;
  totalRemainingValue: number;
  confidence: "high" | "low";    // Low when < 20 valued players remain
  percentOverMarket: number;     // (inflationFactor - 1) * 100
  inflationBand: "overspending" | "neutral" | "buying_window" | "strong_value";
}

export interface EnhancedScarcitySignal {
  position: string;
  supply: number;                // Top-tier players remaining undrafted
  demand: number;                // Teams still needing this position
  totalAvailable: number;        // All undrafted at position
  tierDropValue: number;         // Auction $ gap between best available and next tier
  scarcityIndex: number;         // 0-1 normalized score
  myTeamNeeds: boolean;
}

export interface CategoryGapSignal {
  category: string;
  myTeamTotal: number;
  leagueAvgTotal: number;
  gapZScore: number;             // Negative = below average
  categoryRiskScore: number;     // 0-1, higher = more at risk
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

export interface BudgetCurveSignal {
  remainingBudget: number;
  remainingRosterSpots: number;
  averageRemainingPerPlayer: number;
  budgetPressure: number;        // actual_remaining / optimal_remaining
  optimalRemainingSpend: number;
  maxBidRecommendation: number;
  pacingStatus: "ahead" | "on-track" | "behind";
  inflationAdjustedBid: number;  // For current nominated player
  endgameMode: boolean;          // true when remainingBudget <= 20
  hitterBudgetTarget: { min: number; max: number };   // { min: 185, max: 205 }
  pitcherBudgetTarget: { min: number; max: number };   // { min: 55, max: 70 }
  benchBudget: number;           // 5
  hitterSpent: number;           // Total $ spent on hitters so far
  pitcherSpent: number;          // Total $ spent on pitchers so far
}

export interface DraftAlert {
  id: string;
  type: "inflation" | "scarcity" | "category_gap" | "budget" | "tier_break";
  severity: number;              // 0.0-1.0
  title: string;
  detail: string;
  position?: string;
  category?: string;
  timestamp: number;
}

export interface DraftEngineInput {
  /** ESPN league ID — used for cache isolation across multiple draft sessions. */
  leagueId?: number | null;
  rankings: DraftRanking[];
  auctionValues: AuctionValue[];
  allPicks: DraftPick[];
  myRoster: DraftedPlayer[];
  remainingBudget: number;
  totalTeams: number;
  rosterSize: number;
  /** Detected roster slot breakdown. Falls back to DEFAULT_ROSTER_SLOTS in engine when undefined. */
  rosterSlots?: Record<string, number>;
  teamRosters: Map<string, { teamId: string; teamName: string; playerIds: number[] }>;
  myTeamId: string | null;
  allTeamBudgets: Array<{ teamName: string; remainingBudget: number }>;
  leagueCategories: Category[];
  currentAuctionPlayerId?: number;
  currentAuctionPlayerName?: string;
  espnDomAuctionValues?: Record<number, number>;
  /** ESPN ASVs keyed by normalized player name (from API response). Reliable cross-ID matching. */
  espnAsvByName?: Record<string, number>;
  /**
   * Budget allocation preference: 0-100 where value = % allocated to hitting.
   * Default 65. Applied as SGP multiplier: hitters get split/50, pitchers get (100-split)/50.
   * At 50/50 both get 1.0x; at 65/35 hitters get 1.3x and pitchers get 0.7x.
   */
  pitcherHitterSplit?: number;
  categoryTargets?: Record<string, number>;
  optimizeForTargets?: boolean;
}

export interface CategoryCeiling {
  stat_key: string;
  currentTotal: number;      // Sum from already-drafted players
  ceilingTotal: number;      // currentTotal + greedy-fill optimal remaining
  competitiveTarget: number; // Top-3 threshold from full player pool
  isPunted: boolean;         // ceiling < 70% of competitive target (or > 130% for LOWER_BETTER)
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

export interface PivotPlayer {
  playerId: number;
  playerName: string;
  dollarValue: number;
  category: string;          // The category this player most unlocks
  ceilingLift: number;       // How much the ceiling improves if grabbed
}

export interface BuildArchetypeSignal {
  archetypeLabel: string | null; // e.g. "Power Build", "Pitching-First", null if unclear
  archetypeConfidence: number;   // 0.0-1.0; < 0.5 = show with low-confidence indicator
  picksAnalyzed: number;         // Number of myRoster picks contributing
  ceilings: CategoryCeiling[];
  pivotPlayers: PivotPlayer[];   // Top 3 most impactful available players
  spendingSplit: { hitting: number; pitching: number };
}

export interface RosterOptimizationSignal {
  maxBid: number;
  expectedMarketPrice: number;
  valueSurplus: number;
  shouldBid: boolean;
  /** Pre-cap blended value (40% SGP breakeven + 60% ASV) before strategy caps */
  rawBlendedValue: number | null;
  /** SGP breakeven from binary search (before ASV blend) */
  sgpBreakeven: number | null;
  /** Strategy-adjusted bid cap (after pitcher dampening, SP tier caps, etc.) */
  strategyBidCap: number | null;
  /** Bid path classification */
  bidPath: "IDEAL" | "PL_UNDERVALUED" | "RANKED_VALUE" | "OPPORTUNITY" | "NONE" | null;
  /** Human-readable cap explanation */
  capSource: string | null;
  topTargets: TargetRecommendation[];
  opponentPressure: Record<string, number>;
  simulationEV: number;
  simulationStdDev: number;
  computeTimeMs: number;
}

// ============================================================
// Projected Standings types (Phase 25)
// ============================================================

export interface ProjectedTeamStanding {
  teamId: string;
  teamName: string;
  projectedRotoPts: number;        // Sum of category rank points (N, N-1, ..., 1)
  projectedOverallRank: number;    // 1 = best
  categoryRanks: Record<string, number>;  // stat_key -> rank (1-based)
  categoryValues: Record<string, number>; // stat_key -> projected total value
  draftedPlayersCount: number;     // How many players this team has drafted
}

export interface ProjectedStandingsSignal {
  standings: ProjectedTeamStanding[];  // All teams, sorted by projectedRotoPts desc
  myTeamRank: number;                  // User's projected overall rank (0 if unknown)
  myWeakCategories: string[];          // stat_keys where user ranks in bottom 4
  myStrongCategories: string[];        // stat_keys where user ranks in top 3
  draftProgressWeight: number;         // 0.0-1.0 confidence weight
  totalTeamCount: number;
  teamsWithData: number;               // Teams with >= 1 FG-matched player
  computeTimeMs: number;
}

export interface DraftEngineSignals {
  inflation: InflationSignal;
  scarcity: EnhancedScarcitySignal[];
  categoryGaps: CategoryGapSignal[];
  budgetCurve: BudgetCurveSignal;
  alerts: DraftAlert[];
  computeTimeMs: number;
  optimization: RosterOptimizationSignal | null;  // null when no nomination or insufficient data
  projectedStandings: ProjectedStandingsSignal | null;
  simulation: ForwardSimulationSignal | null;  // null when insufficient data or too early
  idealRoster: IdealRosterSignal | null;        // null when leagueCategories empty, allPlayers empty, or computation fails
  remainingSlots: Record<string, number>;       // Unfilled dedicated slots per position (zero-count entries removed)
}

// ============================================================
// Plan 02: Bid Optimizer, Opponent Model, Monte Carlo types
// ============================================================

export interface BidOptimizerResult {
  maxBid: number;              // Highest profitable bid
  valueSurplus: number;        // maxBid - projected market value
  baselineValue: number;       // Team SGP without nominated player
  withPlayerValue: number;     // Team SGP at maxBid with player
  expectedMarketPrice: number; // Opponent model estimate
}

export interface OpponentModel {
  teamNeeds: Map<string, Set<string>>;    // teamId -> positions still needed
  teamBudgets: Map<string, number>;       // teamId -> remaining budget
  competitionFactors: Record<string, number>; // position -> 0-1 competition score
  leagueInflationFactor: number;
}

export interface TargetRecommendation {
  playerId: number;
  playerName: string;
  position: string;
  sgpValue: number;
  dollarValue: number;
  maxBid: number;
  expectedMarketPrice: number;
}

// ============================================================
// Phase 29: Ideal Roster Optimizer types
// ============================================================

/**
 * A single player in the ideal roster output.
 * Combines optimizer-selected pool player with tier classification and slot assignment.
 */
export interface IdealRosterPlayer {
  name: string;
  positions: string[];              // All eligible positions from FG auction data
  dollars: number;                  // FanGraphs projected auction value (used for tier classification)
  tier: "anchor" | "core" | "value"; // Spend tier classification based on dollar value
  sgpValue: number;                 // Raw SGP contribution
  slot: string;                     // Assigned roster slot (C, 1B, OF, BN, etc.)
  isDrafted: boolean;               // true if already on myRoster
  externalRank?: number;            // External ranking (e.g., PitcherList) for display
}

/**
 * Full ideal roster signal: best possible roster given remaining budget, slots, and player pool.
 * Uses rank-boosted SGP values consistent with top targets and shopping list.
 */
export interface IdealRosterSignal {
  players: IdealRosterPlayer[];     // Optimally selected roster from available pool
  totalSGPValue: number;            // Total SGP value from optimizer result
  budgetUsed: number;               // Total budget used from optimizer result
  unfilledSlots: number;            // Unfilled roster slots from optimizer result
  anchorCount: number;              // Count of players with dollars > 20
  coreCount: number;                // Count of players with dollars >= 5 and <= 20
  valueCount: number;               // Count of players with dollars < 5
  computeTimeMs: number;
  categoryProgress?: CategoryProgress[];
}

export interface CategoryProgress {
  statKey: string;           // e.g. "HR", "OPS", "ERA"
  label: string;             // Display name from Category
  target: number;            // Winning value from targets
  projected: number;         // Sum/rate from ideal roster players
  percent: number;           // projected/target * 100 (capped at 150 for display)
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

export interface MonteCarloResult {
  expectedTeamValue: number;
  valueStdDev: number;
  bidEV: number;           // EV if we win the nominated player
  passEV: number;          // EV if we pass
  shouldBid: boolean;      // bidEV > passEV
  simCount: number;
  computeTimeMs: number;
}

// ============================================================
// Phase 62: Priority-Scored Auction Engine types
// ============================================================

/**
 * Dynamic category state computed once per pick in computeDraftEngine.
 * Passed to the bid worker to drive EV-based priority scoring.
 */
export interface CategoryState {
  /** statKey → current scarcity weight (clamped 1.0–2.0) */
  scarcityWeights: Record<string, number>;
  /** statKey → pace ratio (current_total / target_total; inverted for LOWER_BETTER) */
  paceRatios: Record<string, number>;
  /** Accumulated $ saved vs FG value from bargain wins */
  surplusPool: number;
  /** Normalized player names with large value dropoff (cliff bonus candidates) */
  cliffPlayers: string[];  // serialized as string[] (not Set) for worker transfer
  /** Initial pool stat totals (denominator for scarcity ratio) */
  initialPoolStats: Record<string, number>;
  /** Category directions */
  categoryDirections: Record<string, "HIGHER_BETTER" | "LOWER_BETTER">;
  /** Categories where pace is below 80% threshold mid-draft — triggers force acquisition logic */
  forceAcquisitionCategories: string[];
}

/** Result from computePriorityScore */
export interface PriorityScoreResult {
  priorityScore: number;   // EV × combined weight product
  evBuffer: number;        // $ added to inflated FG$ for EV+ players
  categoryBonus: number;   // $ added for scarce-category contributors
  playerTags: string[];    // ["is_SB_anchor", "is_closer", etc.]
  maxBid: number;          // inflated FG$ + evBuffer + categoryBonus, capped at FG$×1.25, floored at 1
}

// ============================================================
// Phase 28: Forward-Looking Draft Simulation types
// ============================================================

export interface SimTeamState {
  budget: number;
  slotsRemaining: Record<string, number>;  // Mutable copy of roster slots
  categoryTotals: Record<string, number>;  // Running stat totals for counting stats
  componentTotals: Record<string, number>; // Running components for rate stats (H, AB, IP, ER, etc.)
}

export interface SimDraftState {
  availableIndices: Set<number>;     // O(1) delete per Phase 23 decision
  teamStates: SimTeamState[];        // One per team
  myTeamIndex: number;               // Which team is "me"
}

export interface SimulationOutcome {
  expectedFinish: number;       // Average final roto rank (1 = first)
  winProbability: number;       // Fraction of sims finishing 1st
  top3Probability: number;      // Fraction finishing top 3
  top6Probability: number;      // Fraction finishing top 6
  expectedRotoPts: number;      // Average roto points
  stdDevRotoPts: number;        // Standard deviation of roto points
  simCount: number;
}

export interface CandidateAction {
  type: "bid" | "pass";
  label: string;                // e.g., "Bid $25 on Soto", "Pass"
  playerIndex?: number;         // Index into PoolPlayer[] for bid actions
  bidPrice?: number;            // Price for bid actions
}

export interface DecisionComparison {
  decisions: Array<{
    label: string;
    outcome: SimulationOutcome;
  }>;
  recommendedAction: string;    // Label of best decision (highest win probability)
  computeTimeMs: number;
}

export interface NominationRecommendation {
  playerIndex: number;
  playerName: string;
  reason: string;
  expectedDrain: number;        // Estimated budget drain on opponents
  trapScore: number;            // 0-1, higher = better trap nomination
}

export interface DraftTargetRecommendation {
  playerName: string;
  position: string;
  playerIndex: number;
  bidPrice: number;
  expectedFinish: number;
  winProbability: number;
  top3Probability: number;
}

export interface ForwardSimulationSignal {
  currentDecision: DecisionComparison | null;  // Bid vs pass comparison when player nominated
  winProbability: SimulationOutcome | null;     // Current baseline win probability
  nominationStrategy: NominationRecommendation[] | null;  // Top 3-5 nominations
  draftTargets: DraftTargetRecommendation[] | null;  // Top candidates ranked by sim win probability
  computeTimeMs: number;
}
