import React, { useState } from "react";
import type { Category } from "@espn-fantasy/shared";
import type { ProjectedStandingsSignal } from "../lib/engine/types";

interface CategoryHeatmapProps {
  projectedStandings: ProjectedStandingsSignal | null;
  myTeamId: string | null;
  leagueCategories: Category[];
}

const RANK_COLORS = {
  top: '#37872d',
  mid: '#e0b400',
  low: '#f2495c',
  bottom: '#c4162a',
} as const;

function rankToColor(rank: number, totalTeams: number): string {
  const pct = (rank - 1) / Math.max(1, totalTeams - 1);
  if (pct <= 0.25) return RANK_COLORS.top;
  if (pct <= 0.5) return RANK_COLORS.mid;
  if (pct <= 0.75) return RANK_COLORS.low;
  return RANK_COLORS.bottom;
}

function rankToOrdinal(rank: number): string {
  if (rank === 1) return "1st";
  if (rank === 2) return "2nd";
  if (rank === 3) return "3rd";
  return `${rank}th`;
}

const RATE_STATS = new Set(["ERA", "WHIP", "OPS", "AVG", "OBP", "SLG"]);

function formatStatValue(statKey: string, value: number): string {
  if (RATE_STATS.has(statKey.toUpperCase())) {
    return value.toFixed(statKey.toUpperCase() === "ERA" || statKey.toUpperCase() === "WHIP" ? 2 : 3);
  }
  return Math.round(value).toString();
}

export default function CategoryHeatmap({
  projectedStandings,
  myTeamId,
  leagueCategories,
}: CategoryHeatmapProps) {
  const [view, setView] = useState<"rank" | "stat">("rank");

  const totalTeams = projectedStandings?.totalTeamCount ?? 13;

  const myTeamStanding = projectedStandings?.standings.find(
    (s) => s.teamId === myTeamId
  ) ?? null;

  const isLoading = !projectedStandings || !myTeamStanding;

  return (
    <div
      className="px-3 py-2 bg-grafana-panel border-b border-grafana-border"
      role="region"
      aria-label="Category heatmap"
    >
      {/* Section header — clickable to toggle view */}
      <button
        onClick={() => setView((v) => (v === "rank" ? "stat" : "rank"))}
        className="text-body-xs text-grafana-muted uppercase tracking-wide mb-1.5 w-full text-left hover:text-grafana-text transition-colors"
        aria-label={`Toggle category view (currently showing ${view === "rank" ? "rank points" : "stat totals"})`}
      >
        {view === "rank" ? "Category Ranks" : "Category Stats"}
        <span className="ml-1 text-grafana-muted opacity-50">↕</span>
      </button>

      {isLoading ? (
        /* Empty state: skeleton bars */
        <div className="space-y-1.5">
          <div className="text-label text-grafana-muted mb-1">
            Waiting for draft data...
          </div>
          {(leagueCategories.length > 0 ? leagueCategories : Array.from({ length: 8 })).map(
            (_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-label text-grafana-muted w-8 shrink-0">
                  {leagueCategories[i]?.stat_key ?? "--"}
                </span>
                <div className="flex-1 h-2 rounded-full bg-grafana-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-grafana-border opacity-40"
                    style={{ width: `${30 + Math.random() * 40}%` }}
                  />
                </div>
                <span className="text-label text-grafana-muted w-8 text-right">
                  --
                </span>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {leagueCategories.map((cat) => {
            const statKey = cat.stat_key;
            const rank = myTeamStanding.categoryRanks[statKey] ?? totalTeams;
            const value = myTeamStanding.categoryValues[statKey] ?? 0;
            const barWidth =
              ((totalTeams - rank + 1) / totalTeams) * 100;
            const color = rankToColor(rank, totalTeams);

            return (
              <div key={statKey} className="flex items-center gap-1.5">
                <span className="text-label text-grafana-muted w-8 shrink-0">
                  {statKey}
                </span>
                <div className="flex-1 h-2 rounded-full bg-grafana-border overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <span className="text-label text-grafana-text w-14 text-right font-mono">
                  {view === "rank"
                    ? rankToOrdinal(rank)
                    : formatStatValue(statKey, value)}
                </span>
              </div>
            );
          })}

          {/* Overall rank row */}
          <div className="flex items-center gap-1.5 pt-1 border-t border-grafana-border mt-1">
            <span className="text-label font-semibold text-grafana-text w-8 shrink-0">
              OVR
            </span>
            <div className="flex-1 h-2 rounded-full bg-grafana-border overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${((totalTeams - projectedStandings.myTeamRank + 1) / totalTeams) * 100}%`,
                  backgroundColor: rankToColor(
                    projectedStandings.myTeamRank,
                    totalTeams
                  ),
                }}
              />
            </div>
            <span className="text-label text-grafana-text w-14 text-right font-mono">
              {view === "rank"
                ? rankToOrdinal(projectedStandings.myTeamRank)
                : Math.round(myTeamStanding.projectedRotoPts).toString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
