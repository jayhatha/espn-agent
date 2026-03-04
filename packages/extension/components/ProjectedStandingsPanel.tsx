import React, { useMemo } from "react";
import { useDraftStore } from "../lib/draft-state";

export default function ProjectedStandingsPanel() {
  const { projectedStandings } = useDraftStore();

  const projectedRows = useMemo(() => {
    if (!projectedStandings?.overallStandings) {
      return [];
    }

    const currentRankMap = new Map(
      projectedStandings.currentOverallStandings.map((row) => [
        row.team_id,
        row.overall_rank,
      ]),
    );

    return projectedStandings.overallStandings.map((row) => {
      const currentRank = currentRankMap.get(row.team_id);
      const rankDelta =
        typeof currentRank === "number"
          ? currentRank - row.projected_overall_rank
          : 0;

      return {
        ...row,
        currentRank,
        rankDelta,
      };
    });
  }, [projectedStandings]);

  return (
    <div className="p-3 border-b bg-info-light">
      <h3 className="font-semibold text-sm mb-2 text-info">
        Live Projected Standings
      </h3>

      {!projectedStandings || projectedRows.length === 0 ? (
        <div className="text-xs text-info">
          Projected standings unavailable for this draft league.
        </div>
      ) : (
        <>
          <div className="text-xs text-info mb-2">
            Snapshot: {projectedStandings.snapshotDate}
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {projectedRows.slice(0, 8).map((row) => (
              <div
                key={row.team_id}
                className="bg-surface border border-info-border rounded px-2 py-1 text-xs"
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-content truncate mr-2">
                    #{row.projected_overall_rank} {row.teamName}
                  </span>
                  <span className="font-semibold text-content">
                    {row.projected_overall_points.toFixed(1)} pts
                  </span>
                </div>
                <div className="text-[11px] text-content-tertiary mt-0.5">
                  Current rank: {row.currentRank ?? "—"} · Δ{" "}
                  {row.rankDelta > 0
                    ? `+${row.rankDelta}`
                    : row.rankDelta < 0
                      ? `${row.rankDelta}`
                      : "0"}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
