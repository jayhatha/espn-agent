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

export interface DraftEngineSignals {
  inflation: InflationSignal;
  scarcity: EnhancedScarcitySignal[];
  categoryGaps: CategoryGapSignal[];
  budgetCurve: BudgetCurveSignal;
  alerts: DraftAlert[];
  computeTimeMs: number;
  archetype: BuildArchetypeSignal | null;  // null when insufficient data (< 3 picks)
}
