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

  /** Roster optimization signals from Phase 23 engine — null when no nomination or insufficient data */
  optimization: {
    shouldBid: boolean;
    maxBid: number;
    valueSurplus: number;
    simulationEV: number;
    simulationConfidence: "high" | "medium" | "low"; // derived from stdDev/EV ratio
    topTargets: Array<{
      playerName: string;
      position: string;
      sgpValue: number;
      maxBid: number;
      expectedMarketPrice: number;
    }>; // limited to top 3
    opponentPressure: Array<{
      position: string;
      competitionFactor: number;
    }>; // limited to top 3 by competition factor
  } | null;

  /** What triggered this narration request */
  triggerReason: "alert" | "budget_pressure" | "nomination" | "user_request";
}
