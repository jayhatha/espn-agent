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
  topTargets: TargetRecommendation[];
  opponentPressure: Record<string, number>;
  simulationEV: number;
  simulationStdDev: number;
  computeTimeMs: number;
  shoppingList: ShoppingListSignal | null;
}

export interface TeamCategoryRanking {
  category: string;
  myRank: number;          // 1-based rank among all teams (1 = best)
  totalTeams: number;
  myTotal: number;
  leagueMedian: number;
  direction: "HIGHER_BETTER" | "LOWER_BETTER";
}

export interface CategoryDemand {
  category: string;
  weakTeamCount: number;   // Teams below median (potential bidders)
  strongTeamCount: number; // Teams above median (unlikely to bid heavily)
  demandLevel: "high" | "medium" | "low";  // high = many weak teams = bidding wars expected
}

export interface LeagueAnalysisSignal {
  categoryRankings: TeamCategoryRanking[];  // My rank per category vs field
  categoryDemand: CategoryDemand[];         // Market demand per category
  recommendations: string[];                // 2-3 strategic recommendations
  teamsAnalyzed: number;                    // How many teams had enough data
  computeTimeMs: number;
  /** Exposed for projected-standings.ts — teamId -> stat_key -> total. Optional: existing consumers unaffected. */
  teamDraftedTotals?: Map<string, Record<string, number>>;
  /** Per-team summed components (H, AB, IP, ER, etc.) for rate stat recomposition in projected-standings. */
  teamDraftedComponents?: Map<string, Record<string, number>>;
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
  leagueAnalysis: LeagueAnalysisSignal | null;
  projectedStandings: ProjectedStandingsSignal | null;
  simulation: ForwardSimulationSignal | null;  // null when insufficient data or too early
  idealRoster: IdealRosterSignal | null;        // null when leagueCategories empty, allPlayers empty, or computation fails
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

/** A single player target within a position group */
export interface PositionTarget {
  playerName: string;
  normalizedName: string;
  positions: string[];        // All eligible positions (e.g., ["1B", "3B"])
  sgpValue: number;           // Raw SGP
  adjustedSgp: number;        // SGP with positional need + weak category boosts
  dollarValue: number;        // FanGraphs auction dollar value
  maxBid: number;             // Estimated max bid (SGP-share heuristic, NOT binary search)
  expectedMarketPrice: number;// Opponent model estimate
  valueSurplus: number;       // maxBid - expectedMarketPrice
  isPitcher: boolean;
}

/** A position group in the shopping list */
export interface PositionGroup {
  position: string;           // e.g., "SS", "OF", "SP"
  priorityScore: number;      // Combined priority (0-1 scale, higher = more urgent)
  unfilledSlots: number;      // How many slots at this position are unfilled
  scarcityIndex: number;      // From EnhancedScarcitySignal (0 if not found)
  budgetFit: number;          // Fraction of targets affordable (0-1)
  targets: PositionTarget[];  // Top N players, sorted by adjustedSgp descending
}

/** The complete shopping list signal */
export interface ShoppingListSignal {
  positionGroups: PositionGroup[];  // Sorted by priorityScore descending
  totalTargets: number;             // Sum of all targets across groups
  computeTimeMs: number;
}

// ============================================================
// Phase 29: Ideal Roster Optimizer types
// ============================================================

/**
 * A single player in the ideal roster output.
 * Combines optimizer-selected pool player with tier classification and lock status.
 */
export interface IdealRosterPlayer {
  name: string;
  positions: string[];              // All eligible positions from FG auction data
  dollars: number;                  // FanGraphs projected auction value (used for tier classification)
  tier: "anchor" | "core" | "value"; // Spend tier classification based on dollar value
  isLocked: boolean;                // true if player is already drafted (from myRoster)
  sgpValue: number;                 // Raw SGP contribution
}

/**
 * Full ideal roster signal: best possible roster given remaining budget, slots, and player pool.
 * Uses rank-boosted SGP values consistent with top targets and shopping list.
 */
export interface IdealRosterSignal {
  players: IdealRosterPlayer[];     // Full ideal roster (locked + optimally selected)
  totalSGPValue: number;            // Total SGP value from optimizer result
  budgetUsed: number;               // Total budget used from optimizer result
  unfilledSlots: number;            // Unfilled roster slots from optimizer result
  anchorCount: number;              // Count of players with dollars > 20
  coreCount: number;                // Count of players with dollars >= 5 and <= 20
  valueCount: number;               // Count of players with dollars < 5
  computeTimeMs: number;
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
