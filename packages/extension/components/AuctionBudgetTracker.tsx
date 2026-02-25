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
    ahead: "bg-green-50 border-green-200 text-green-900",
    "on-track": "bg-blue-50 border-blue-200 text-blue-900",
    behind: "bg-red-50 border-red-200 text-red-900",
  };

  const pacingLabels = {
    ahead: "✓ Ahead of pace (can be aggressive)",
    "on-track": "→ On track",
    behind: "⚠ Behind pace (conserve budget)",
  };

  return (
    <div className="p-3 border-b bg-gray-50">
      <h3 className="font-semibold text-sm mb-2">Budget Pacing</h3>

      {/* Budget overview */}
      <div className="bg-white p-3 rounded border mb-2">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-600">Remaining Budget</span>
          <span className="text-lg font-bold text-gray-900">
            ${pacing.remainingBudget}
          </span>
        </div>

        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-600">Roster Spots Left</span>
          <span className="font-semibold text-gray-900">
            {pacing.remainingRosterSpots}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-sm text-gray-600">Avg per Player</span>
          <span className="font-semibold text-gray-900">
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
      <div className="mt-2 bg-blue-50 p-2 rounded border border-blue-200">
        <div className="text-xs text-blue-700 mb-1">Recommended Max Bid</div>
        <div className="text-xl font-bold text-blue-900">
          ${pacing.recommendedMaxBid}
        </div>
        <div className="text-xs text-blue-600 mt-1">
          (40% of remaining budget)
        </div>
      </div>
    </div>
  );
}
