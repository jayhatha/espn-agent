import React, { useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";
import { calculateBudgetPacing } from "../lib/value-calculations";
import type { DraftEngineSignals } from "../lib/engine";

interface AuctionBudgetTrackerProps {
  engineSignals?: DraftEngineSignals | null;
}

export default function AuctionBudgetTracker({ engineSignals }: AuctionBudgetTrackerProps) {
  const { myRoster, remainingBudget, rosterSize, draftFormat } =
    useDraftStore();

  // Fallback pacing when engine signals are unavailable
  const fallbackPacing = useMemo(() => {
    // Derive total budget from remaining + spent (avoids hardcoded 260)
    const spent = myRoster.reduce((sum, p) => sum + (p.cost ?? 0), 0);
    const totalBudget = remainingBudget + spent;
    return calculateBudgetPacing(totalBudget, myRoster, rosterSize);
  }, [myRoster, rosterSize, remainingBudget]);

  if (draftFormat !== "auction") {
    return null; // Only show for auction drafts
  }

  // If engine signals available, use the richer budget curve data
  const useEngine = engineSignals != null;

  const displayRemainingBudget = useEngine
    ? engineSignals!.budgetCurve.remainingBudget
    : fallbackPacing.remainingBudget;

  const displayRemainingSpots = useEngine
    ? engineSignals!.budgetCurve.remainingRosterSpots
    : fallbackPacing.remainingRosterSpots;

  const displayAvgPerPlayer = useEngine
    ? engineSignals!.budgetCurve.averageRemainingPerPlayer
    : fallbackPacing.averageRemainingPerPlayer;

  const displayPacingStatus = useEngine
    ? engineSignals!.budgetCurve.pacingStatus
    : fallbackPacing.pacingStatus;

  const displayMaxBid = useEngine
    ? engineSignals!.budgetCurve.maxBidRecommendation
    : fallbackPacing.recommendedMaxBid;

  const pacingColors = {
    ahead: "bg-positive-light border-positive-border text-positive",
    "on-track": "bg-info-light border-info-border text-info",
    behind: "bg-negative-light border-negative-border text-negative",
  };

  const pacingLabels = {
    ahead: "✓ Ahead of pace (can be aggressive)",
    "on-track": "→ On track",
    behind: "⚠ Behind pace (conserve budget)",
  };

  return (
    <div className="p-3 border-b border-surface-tertiary bg-surface-secondary">
      <h3 className="font-semibold text-sm mb-2">Budget Pacing</h3>

      {/* Budget overview */}
      <div className="bg-surface p-3 rounded border border-surface-tertiary mb-2">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-content-secondary">Remaining Budget</span>
          <span className="text-lg font-bold text-content">
            ${displayRemainingBudget}
          </span>
        </div>

        <div className="flex justify-between mb-2">
          <span className="text-sm text-content-secondary">Roster Spots Left</span>
          <span className="font-semibold text-content">
            {displayRemainingSpots}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-sm text-content-secondary">Avg per Player</span>
          <span className="font-semibold text-content">
            ${Math.round(displayAvgPerPlayer)}
          </span>
        </div>
      </div>

      {/* Pacing status */}
      <div
        className={`p-2 rounded border text-sm ${pacingColors[displayPacingStatus]}`}
      >
        {pacingLabels[displayPacingStatus]}
      </div>

      {/* Recommended max bid — upgraded with engine data when available */}
      <div className="mt-2 bg-info-light p-2 rounded border border-info-border">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-info">Recommended Max Bid</div>
          {useEngine && (
            <div className="flex items-center gap-1">
              <span className="text-body-xs text-content-secondary">Inflation:</span>
              <span
                className={`text-body-xs font-semibold ${
                  engineSignals!.inflation.percentOverMarket >= 0
                    ? "text-warning"
                    : "text-positive"
                }`}
              >
                {engineSignals!.inflation.percentOverMarket >= 0 ? "+" : ""}
                {Math.round(engineSignals!.inflation.percentOverMarket)}%
              </span>
            </div>
          )}
        </div>
        <div className="text-xl font-bold text-info">
          ${displayMaxBid}
        </div>
        <div className="text-xs text-info mt-1">
          {useEngine
            ? "(inflation-adjusted, budget-capped)"
            : "(40% of remaining budget)"}
        </div>
        {useEngine && engineSignals!.budgetCurve.inflationAdjustedBid > 0 && (
          <div className="mt-1.5 pt-1.5 border-t border-info-border/50">
            <div className="flex items-center justify-between">
              <span className="text-body-xs text-info opacity-80">Fair Value</span>
              <span className="text-body-xs font-semibold text-info">
                ${engineSignals!.budgetCurve.inflationAdjustedBid}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
