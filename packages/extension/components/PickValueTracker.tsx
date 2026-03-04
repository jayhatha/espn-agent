import React, { useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";
import { calculateAllPickValues } from "../lib/value-calculations";

function formatNumber(value: unknown, digits: number): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0.0";
  }

  return numericValue.toFixed(digits);
}

export default function PickValueTracker() {
  const { allPicks, rankings, myTeamId } = useDraftStore();

  const pickValues = useMemo(() => {
    return calculateAllPickValues(allPicks, rankings);
  }, [allPicks, rankings]);

  // Group by team
  const picksByTeam = useMemo(() => {
    const grouped: Record<string, typeof pickValues> = {};
    pickValues.forEach((pv) => {
      if (!grouped[pv.teamName]) {
        grouped[pv.teamName] = [];
      }
      grouped[pv.teamName].push(pv);
    });
    return grouped;
  }, [pickValues]);

  // Calculate team efficiency (average value per pick)
  const teamEfficiency = useMemo(() => {
    return Object.entries(picksByTeam)
      .map(([teamName, picks]) => {
        const avgValue =
          picks.reduce((sum, p) => sum + p.value, 0) / picks.length;
        return { teamName, avgValue, pickCount: picks.length };
      })
      .sort((a, b) => b.avgValue - a.avgValue);
  }, [picksByTeam]);

  if (allPicks.length === 0) {
    return (
      <div className="p-3 text-sm text-content-tertiary text-center">No picks yet</div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Team efficiency leaderboard */}
      <div className="p-3 bg-surface-secondary border-b">
        <h3 className="font-semibold text-sm mb-2">Draft Efficiency</h3>
        <div className="space-y-1">
          {teamEfficiency.slice(0, 5).map((team, index) => (
            <div
              key={team.teamName}
              className={`flex justify-between text-xs p-2 rounded ${
                team.teamName === myTeamId
                  ? "bg-info-light border border-info-border"
                  : "bg-surface border border-surface-tertiary"
              }`}
            >
              <span className="font-medium">
                {index + 1}. {team.teamName}
              </span>
              <span
                className={
                  team.avgValue > 0
                    ? "text-positive"
                    : team.avgValue < 0
                      ? "text-negative"
                      : "text-content-secondary"
                }
              >
                {team.avgValue > 0 ? "+" : ""}
                {formatNumber(team.avgValue, 1)} avg
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent picks with value indicators */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          <h3 className="font-semibold text-sm mb-2">Recent Picks</h3>
          <div className="space-y-2">
            {pickValues
              .slice(-10)
              .reverse()
              .map((pv) => (
                <div
                  key={pv.pickNumber}
                  className={`p-2 rounded border ${
                    pv.teamName === myTeamId
                      ? "bg-info-light border-info-border"
                      : "bg-surface border-surface-tertiary"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="text-sm font-medium">
                      Pick {pv.pickNumber}: {pv.playerName}
                    </div>
                    <div
                      className={`text-xs px-2 py-1 rounded ${
                        pv.value > 3
                          ? "bg-positive-light text-positive"
                          : pv.value < -3
                            ? "bg-negative-light text-negative"
                            : "bg-surface-tertiary text-content-secondary"
                      }`}
                    >
                      {pv.valueLabel}
                    </div>
                  </div>
                  <div className="text-xs text-content-tertiary">
                    {pv.teamName} • Expected rank: #{pv.expectedRank}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
