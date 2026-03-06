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

export interface MonteCarloResult {
  expectedTeamValue: number;
  valueStdDev: number;
  bidEV: number;           // EV if we win the nominated player
  passEV: number;          // EV if we pass
  shouldBid: boolean;      // bidEV > passEV
  simCount: number;
  computeTimeMs: number;
}
