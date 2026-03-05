/**
 * NarratorPayload: Extension-side type definition matching the backend contract.
 * Defined here independently (no shared package import — extension and backend
 * are separate build targets).
 *
 * Must match the NarratorPayload interface in packages/backend/src/agents/draft-narrator.ts
 */
export interface NarratorPayload {
  draftPhase: "early" | "mid" | "late"; // 0-5 picks = early, 6-15 = mid, 16+ = late

  alerts: Array<{
    type: string;
    severity: number;
    title: string;
    detail: string;
    position?: string;
    category?: string;
  }>;

  inflation: {
    percentOverMarket: number;
    confidence: "high" | "low";
  };

  budgetSummary: {
    remainingBudget: number;
    pacingStatus: "ahead" | "on-track" | "behind";
    budgetPressure: number;
    maxBidRecommendation: number;
  };

  archetype: {
    archetypeLabel: string | null;
    archetypeConfidence: number;
    puntedCategories: string[];
    pivotPlayers: Array<{
      playerName: string;
      dollarValue: number;
      category: string;
    }>;
  } | null;

  topScarcity: Array<{
    position: string;
    scarcityIndex: number;
    myTeamNeeds: boolean;
    supply: number;
    demand: number;
  }>;

  categoryGaps: Array<{
    category: string;
    gapZScore: number;
    categoryRiskScore: number;
  }>;

  currentAuctionPlayer: {
    playerName: string;
    currentBid?: number;
    positions?: string[];
    espnValue?: number;
    maxBidRecommendation?: number;
  } | null;

  triggerReason: "alert" | "archetype_change" | "budget_pressure" | "user_request";

  strategy: {
    anchorPlayerName: string | null;
    anchorAcquired: boolean;
    fallbackPaths: string[];
    strategyState: "nominal" | "anchor_lost" | "pivot_needed";
  } | null;
}
