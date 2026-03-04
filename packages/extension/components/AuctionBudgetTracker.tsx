import React, { useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";
import { calculateBudgetPacing } from "../lib/value-calculations";

export default function AuctionBudgetTracker() {
  const { myRoster, remainingBudget, rosterSize, draftFormat } =
    useDraftStore();

  const pacing = useMemo(() => {
    // Assume standard auction budget is 260
    const totalBudget = 260;
    return calculateBudgetPacing(totalBudget, myRoster, rosterSize);
  }, [myRoster, rosterSize]);

  if (draftFormat !== "auction") {
    return null; // Only show for auction drafts
  }

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
            ${pacing.remainingBudget}
          </span>
        </div>

        <div className="flex justify-between mb-2">
          <span className="text-sm text-content-secondary">Roster Spots Left</span>
          <span className="font-semibold text-content">
            {pacing.remainingRosterSpots}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-sm text-content-secondary">Avg per Player</span>
          <span className="font-semibold text-content">
            ${Math.round(pacing.averageRemainingPerPlayer)}
          </span>
        </div>
      </div>

      {/* Pacing status */}
      <div
        className={`p-2 rounded border text-sm ${pacingColors[pacing.pacingStatus]}`}
      >
        {pacingLabels[pacing.pacingStatus]}
      </div>

      {/* Recommended max bid */}
      <div className="mt-2 bg-info-light p-2 rounded border border-info-border">
        <div className="text-xs text-info mb-1">Recommended Max Bid</div>
        <div className="text-xl font-bold text-info">
          ${pacing.recommendedMaxBid}
        </div>
        <div className="text-xs text-info mt-1">
          (40% of remaining budget)
        </div>
      </div>
    </div>
  );
}
