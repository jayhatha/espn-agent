import React, { useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";

export default function RosterSummary() {
  const { myRoster, draftFormat, remainingBudget } = useDraftStore();

  // Calculate position counts
  const positionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    myRoster.forEach((player) => {
      player.positions.forEach((pos) => {
        counts[pos] = (counts[pos] || 0) + 1;
      });
    });
    return counts;
  }, [myRoster]);

  // Calculate category totals (simplified)
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {
      HR: 0,
      RBI: 0,
      SB: 0,
      W: 0,
      SV: 0,
    };

    myRoster.forEach((player) => {
      Object.keys(totals).forEach((stat) => {
        if (player.projectedStats[stat]) {
          totals[stat] += player.projectedStats[stat] as number;
        }
      });
    });

    return totals;
  }, [myRoster]);

  return (
    <div className="p-3 bg-gray-50 border-b">
      <h3 className="font-semibold text-sm mb-2">
        Your Roster ({myRoster.length})
      </h3>

      {/* Position breakdown */}
      {Object.keys(positionCounts).length > 0 && (
        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
          {Object.entries(positionCounts).map(([pos, count]) => (
            <div key={pos} className="bg-white p-2 rounded border text-center">
              <div className="font-semibold text-gray-900">{pos}</div>
              <div className="text-gray-600">{count}</div>
            </div>
          ))}
        </div>
      )}

      {/* Category totals */}
      {myRoster.length > 0 && (
        <div className="bg-white p-2 rounded border text-xs">
          <div className="font-semibold text-gray-700 mb-1">
            Projected Totals
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(categoryTotals).map(([stat, total]) => (
              <div key={stat}>
                <span className="text-gray-600">{stat}:</span>{" "}
                <span className="font-semibold">{Math.round(total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {draftFormat === "auction" && (
        <div className="mt-2 bg-blue-50 p-2 rounded border border-blue-200 text-sm text-center">
          <span className="font-semibold text-blue-900">
            ${remainingBudget}
          </span>
          <span className="text-blue-700"> remaining</span>
        </div>
      )}

      {myRoster.length === 0 && (
        <div className="text-xs text-gray-500 text-center py-2">
          No players drafted yet
        </div>
      )}
    </div>
  );
}
