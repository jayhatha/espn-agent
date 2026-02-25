import type {
  DraftRanking,
  DraftedPlayer,
  Category,
  DraftPick,
} from "@espn-fantasy/shared";

// Pick Value Tracking
export interface PickValue {
  pickNumber: number;
  playerId: number;
  playerName: string;
  teamName: string;
  expectedRank: number;
  actualPick: number;
  value: number; // Positive = value (picked later than expected), negative = reach (picked earlier)
  valueLabel: string; // e.g., "5-pick value" or "8-pick reach"
}

export function calculatePickValue(
  pick: DraftPick,
  rankings: DraftRanking[],
): PickValue {
  // Find player in rankings to get expected rank
  const playerRanking = rankings.find((r) => r.playerId === pick.playerId);

  if (!playerRanking) {
    return {
      pickNumber: pick.pickNumber,
      playerId: pick.playerId,
      playerName: pick.playerName,
      teamName: pick.teamName,
      expectedRank: 0,
      actualPick: pick.pickNumber,
      value: 0,
      valueLabel: "Unranked",
    };
  }

  // AUDIT FIX: Assume rankings are already sorted by VBD descending (from backend)
  // Avoid O(n log n) redundant sort on every pick
  const expectedRank = rankings.findIndex((r) => r.playerId === pick.playerId) + 1;

  // Guard against invalid rank calculation
  if (!Number.isFinite(expectedRank) || expectedRank === 0) {
    return {
      pickNumber: pick.pickNumber,
      playerId: pick.playerId,
      playerName: pick.playerName,
      teamName: pick.teamName,
      expectedRank: 0,
      actualPick: pick.pickNumber,
      value: 0,
      valueLabel: "Unranked",
    };
  }

  // Value = expected rank - actual pick
  // Positive = picked later than expected (good value)
  // Negative = picked earlier than expected (reach/overpay)
  const value = expectedRank - pick.pickNumber;

  let valueLabel: string;
  if (value > 0) {
    valueLabel = `${value}-pick value`;
  } else if (value < 0) {
    valueLabel = `${Math.abs(value)}-pick reach`;
  } else {
    valueLabel = "On target";
  }

  return {
    pickNumber: pick.pickNumber,
    playerId: pick.playerId,
    playerName: pick.playerName,
    teamName: pick.teamName,
    expectedRank,
    actualPick: pick.pickNumber,
    value,
    valueLabel,
  };
}

// Calculate value for all picks
export function calculateAllPickValues(
  picks: DraftPick[],
  rankings: DraftRanking[],
): PickValue[] {
  return picks.map((pick) => calculatePickValue(pick, rankings));
}

// Snake Draft: Pair Recommendations at the Turn
export interface PairRecommendation {
  player1: DraftRanking;
  player2: DraftRanking;
  combinedValue: number;
  categoryBalance: string[];
  rationale: string;
}

export function getSnakeTurnPairs(
  availablePlayers: DraftRanking[],
  currentRoster: DraftedPlayer[],
  categories: Category[],
): PairRecommendation[] {
  const pairs: PairRecommendation[] = [];

  // Sort by VBD descending
  const ranked = [...availablePlayers].sort((a, b) => b.vbdScore - a.vbdScore);

  // Top 50 players for pairing (avoid combinatorial explosion)
  const topPlayers = ranked.slice(0, 50);

  for (let i = 0; i < topPlayers.length; i++) {
    for (let j = i + 1; j < topPlayers.length; j++) {
      const player1 = topPlayers[i];
      const player2 = topPlayers[j];

      // Calculate combined value with NaN guard
      const vbd1 = Number.isFinite(player1.vbdScore) ? player1.vbdScore : 0;
      const vbd2 = Number.isFinite(player2.vbdScore) ? player2.vbdScore : 0;
      const combinedValue = vbd1 + vbd2;

      // Analyze category coverage
      const categoriesCovered = getCategoriesCovered(
        player1,
        player2,
        currentRoster,
        categories,
      );

      // AUDIT FIX: Penalize same-position pairs to encourage roster diversity
      // Example: Two catchers provide redundant positional value vs catcher + OF
      const positionPenalty =
        player1.primaryPosition === player2.primaryPosition ? 0.9 : 1.0;

      pairs.push({
        player1,
        player2,
        combinedValue: combinedValue * positionPenalty,
        categoryBalance: categoriesCovered,
        rationale: generateRationale(player1, player2, categoriesCovered),
      });
    }
  }

  // Sort by combined value, return top 10 pairs
  return pairs.sort((a, b) => b.combinedValue - a.combinedValue).slice(0, 10);
}

function getCategoriesCovered(
  p1: DraftRanking,
  p2: DraftRanking,
  roster: DraftedPlayer[],
  categories: Category[],
): string[] {
  // Simplified: identify if pair strengthens any category
  // Real implementation would compute team totals + pair contributions
  const covered: string[] = [];

  if (p1.categorySGPs && p2.categorySGPs) {
    categories.forEach((cat) => {
      const p1Contribution = p1.categorySGPs[cat.category_id] || 0;
      const p2Contribution = p2.categorySGPs[cat.category_id] || 0;

      if (p1Contribution + p2Contribution > 1.0) {
        covered.push(cat.name);
      }
    });
  }

  return covered;
}

function generateRationale(
  p1: DraftRanking,
  p2: DraftRanking,
  categories: string[],
): string {
  const p1Vbd = Number.isFinite(p1.vbdScore) ? p1.vbdScore : 0;
  const p2Vbd = Number.isFinite(p2.vbdScore) ? p2.vbdScore : 0;

  if (categories.length === 0) {
    return `Best available value (${p1Vbd.toFixed(1)} + ${p2Vbd.toFixed(1)} VBD)`;
  }

  return `Strengthens ${categories.slice(0, 3).join(", ")} (${p1Vbd.toFixed(1)} + ${p2Vbd.toFixed(1)} VBD)`;
}

// Auction Draft: Budget Pacing
export interface BudgetPacing {
  remainingBudget: number;
  remainingRosterSpots: number;
  averageRemainingPerPlayer: number;
  recommendedMaxBid: number;
  pacingStatus: "ahead" | "on-track" | "behind";
}

export function calculateBudgetPacing(
  totalBudget: number,
  currentRoster: DraftedPlayer[],
  rosterSize: number,
): BudgetPacing {
  const spentBudget = currentRoster.reduce((sum, p) => sum + (p.cost || 0), 0);
  const remainingBudget = Math.max(0, totalBudget - spentBudget);
  const remainingRosterSpots = Math.max(0, rosterSize - currentRoster.length);

  // AUDIT FIX: Guard against division by zero
  const averageRemainingPerPlayer =
    remainingRosterSpots > 0 ? remainingBudget / remainingRosterSpots : 0;

  // Ensure averageRemainingPerPlayer is finite
  const safeAverage = Number.isFinite(averageRemainingPerPlayer)
    ? averageRemainingPerPlayer
    : 0;

  // Recommended max bid: 40% of remaining budget (avoid overcommitting)
  const recommendedMaxBid = Math.floor(remainingBudget * 0.4);

  // Pacing status: compare remaining budget share vs remaining roster share.
  // If budget share is materially higher than roster share, team is ahead.
  const budgetShareRemaining =
    totalBudget > 0 ? remainingBudget / totalBudget : 0;
  const rosterShareRemaining =
    rosterSize > 0 ? remainingRosterSpots / rosterSize : 0;
  const shareDelta = budgetShareRemaining - rosterShareRemaining;

  // AUDIT FIX: Reduced threshold from 0.1 (10%) to 0.05 (5%) for more sensitive pacing alerts
  let pacingStatus: "ahead" | "on-track" | "behind";
  if (shareDelta > 0.05) {
    pacingStatus = "ahead";
  } else if (shareDelta < -0.05) {
    pacingStatus = "behind";
  } else {
    pacingStatus = "on-track";
  }

  return {
    remainingBudget,
    remainingRosterSpots,
    averageRemainingPerPlayer: safeAverage,
    recommendedMaxBid,
    pacingStatus,
  };
}

export function calculateAuctionValueWithInflation(
  baseValue: number,
  spentByAll: number,
  totalBudgetPool: number,
): number {
  // AUDIT FIX: Inflation adjustment for auction dynamics
  // Assumes 70% of total budget spent by mid-draft under standard pacing
  // This assumption works best during the middle third of the draft
  // Early draft: may overestimate inflation (not enough data)
  // Late draft: may underestimate scarcity (approaching 100% spent)
  const expectedSpent = totalBudgetPool * 0.7;
  const inflationFactor = spentByAll > 0 ? expectedSpent / spentByAll : 1.0;

  // Guard against invalid inflation factors
  const safeInflationFactor = Number.isFinite(inflationFactor)
    ? Math.max(0.5, Math.min(2.0, inflationFactor)) // Clamp between 0.5x and 2x
    : 1.0;

  const adjustedValue = baseValue * safeInflationFactor;

  return Number.isFinite(adjustedValue) ? Math.floor(adjustedValue) : Math.floor(baseValue);
}
