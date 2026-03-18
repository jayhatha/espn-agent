import type { BudgetCurveSignal } from "./types";

export function computeBudgetCurve(
  remainingBudget: number,
  remainingRosterSpots: number,
  totalBudget: number,
  totalRosterSize: number,
  inflationFactor: number,
  currentPlayerDollarValue: number,
  hitterSpent: number = 0,
  pitcherSpent: number = 0,
): BudgetCurveSignal {
  const minReserve = Math.max(0, remainingRosterSpots - 1); // $1 per remaining spot
  const usableBudget = Math.max(0, remainingBudget - minReserve);

  // Optimal spend curve: how much budget should remain at this draft stage
  const rosterProgress = totalRosterSize > 0
    ? 1 - (remainingRosterSpots / totalRosterSize)
    : 0;
  // Expect 90% of budget spent when roster is full (10% goes to $1 fillers)
  const expectedSpentFraction = rosterProgress * 0.9;
  const optimalRemainingSpend = totalBudget * (1 - expectedSpentFraction);

  // Budget pressure: >1.0 = have more than optimal (aggressive), <1.0 = behind (conserve)
  const budgetPressure = optimalRemainingSpend > 0
    ? remainingBudget / optimalRemainingSpend
    : 1.0;

  let pacingStatus: "ahead" | "on-track" | "behind";
  if (budgetPressure > 1.05) pacingStatus = "ahead";
  else if (budgetPressure < 0.95) pacingStatus = "behind";
  else pacingStatus = "on-track";

  // Max bid recommendation: inflation-adjusted value, capped by budget constraints
  const inflationAdjustedValue = Math.round(currentPlayerDollarValue * inflationFactor);
  const maxBidFromBudget = Math.floor(usableBudget * 0.35); // Never put >35% of usable on one player
  const maxBidFromValue = Math.round(inflationAdjustedValue * 1.10); // Allow 10% overpay on targets
  const maxBidRecommendation = Math.max(1, Math.min(maxBidFromValue, maxBidFromBudget, usableBudget));

  const avgPerPlayer = remainingRosterSpots > 0
    ? usableBudget / remainingRosterSpots
    : 0;

  // Endgame mode: activates when budget is critically low
  const endgameMode = remainingBudget <= 20;

  return {
    remainingBudget,
    remainingRosterSpots,
    averageRemainingPerPlayer: Math.round(avgPerPlayer * 10) / 10,
    budgetPressure: Math.round(budgetPressure * 100) / 100,
    optimalRemainingSpend: Math.round(optimalRemainingSpend),
    maxBidRecommendation,
    pacingStatus,
    inflationAdjustedBid: Math.max(1, Math.min(inflationAdjustedValue, usableBudget)),
    endgameMode,
    hitterBudgetTarget: { min: 195, max: 220 },
    pitcherBudgetTarget: { min: 35, max: 60 },
    benchBudget: 5,
    hitterSpent,
    pitcherSpent,
  };
}
