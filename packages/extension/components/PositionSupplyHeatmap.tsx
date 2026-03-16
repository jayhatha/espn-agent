import React, { useMemo } from "react";
import type { DraftRanking, DraftPick } from "@espn-fantasy/shared";

interface PositionSupplyHeatmapProps {
  rankings: DraftRanking[];
  allPicks: DraftPick[];
}

const SUPPLY_POOL_SIZES: Record<string, number> = {
  C: 15,
  "1B": 15,
  "2B": 15,
  "3B": 15,
  SS: 15,
  OF: 50,
  SP: 30,
  RP: 15,
};

const POSITION_ORDER = ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP"];

function getBarColor(drafted: number, total: number): string {
  if (total === 0) return "bg-grafana-positive";
  const pct = drafted / total;
  if (pct < 0.5) return "bg-grafana-positive";
  if (pct <= 0.75) return "bg-grafana-warning";
  return "bg-grafana-negative";
}

export default function PositionSupplyHeatmap({
  rankings,
  allPicks,
}: PositionSupplyHeatmapProps) {
  const supply = useMemo(() => {
    const draftedIds = new Set(allPicks.map((p) => p.playerId));

    const result: Record<string, { drafted: number; total: number }> = {};

    for (const pos of POSITION_ORDER) {
      const poolSize = SUPPLY_POOL_SIZES[pos];
      const topN = rankings
        .filter((r) =>
          r.positions.some((p) => p.toUpperCase().includes(pos))
        )
        .sort((a, b) => (a.externalRank ?? 9999) - (b.externalRank ?? 9999))
        .slice(0, poolSize);

      const drafted = topN.filter((r) => draftedIds.has(r.playerId)).length;
      result[pos] = { drafted, total: topN.length };
    }

    return result;
  }, [rankings, allPicks]);

  if (rankings.length === 0) {
    return (
      <div className="px-3 py-2 bg-grafana-panel border-b border-grafana-border">
        <div className="text-body-xs text-grafana-muted uppercase tracking-wide mb-1.5">
          Position Supply
        </div>
        <div className="text-label text-grafana-muted">
          Load rankings to see position supply
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 bg-grafana-panel border-b border-grafana-border">
      <div className="text-body-xs text-grafana-muted uppercase tracking-wide mb-1.5">
        Position Supply
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {POSITION_ORDER.map((pos) => {
          const { drafted, total } = supply[pos] ?? { drafted: 0, total: 0 };
          const fillPct = total > 0 ? (drafted / total) * 100 : 0;
          const barColorClass = getBarColor(drafted, total);

          return (
            <div key={pos} className="flex flex-col gap-0.5 min-w-[48px]">
              <div className="flex items-center justify-between">
                <span className="text-label font-semibold text-grafana-text">
                  {pos}
                </span>
                <span className="text-label text-grafana-muted ml-1">
                  {drafted}/{total}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-grafana-border overflow-hidden w-full">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
                  style={{ width: `${fillPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
