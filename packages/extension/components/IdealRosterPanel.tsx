import React from "react";
import type { IdealRosterSignal } from "../lib/engine/types";
import { useDraftStore } from "../lib/draft-state";

interface IdealRosterPanelProps {
  idealRoster: IdealRosterSignal | null;
}

function buildTierSummary(
  anchorCount: number,
  coreCount: number,
  valueCount: number
): string {
  const parts: string[] = [];
  if (anchorCount > 0) parts.push(`${anchorCount} anchor${anchorCount !== 1 ? "s" : ""}`);
  if (coreCount > 0) parts.push(`${coreCount} core`);
  if (valueCount > 0) parts.push(`${valueCount} value`);
  return parts.join(" + ");
}

export default function IdealRosterPanel({ idealRoster }: IdealRosterPanelProps) {
  if (!idealRoster || idealRoster.players.length === 0) {
    return null;
  }

  const { players, totalSGPValue, budgetUsed, unfilledSlots, anchorCount, coreCount, valueCount } =
    idealRoster;

  const draftedCount = players.filter(p => p.isDrafted).length;
  const tierSummary = buildTierSummary(anchorCount, coreCount, valueCount);

  const optimizeForTargets = useDraftStore(s => s.optimizeForTargets);
  const setOptimizeForTargets = useDraftStore(s => s.setOptimizeForTargets);

  return (
    <details open className="group">
      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-grafana-panel hover:bg-grafana-border/50 select-none border-t border-grafana-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-body-sm font-semibold text-grafana-text flex-shrink-0">Ideal Roster</span>
          <span className="text-body-xs text-grafana-muted truncate">
            {draftedCount}/{players.length} filled
            {tierSummary && ` \u00b7 ${tierSummary}`}
          </span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOptimizeForTargets(!optimizeForTargets);
            }}
            className={`text-label px-1.5 py-0.5 rounded font-semibold flex-shrink-0 transition-colors ${
              optimizeForTargets
                ? "bg-grafana-text text-grafana-bg"
                : "bg-grafana-border text-grafana-muted hover:bg-grafana-border/80"
            }`}
            title={optimizeForTargets ? "Optimizing for category targets \u2014 click to use pure SGP" : "Using pure SGP efficiency \u2014 click to optimize for category targets"}
          >
            TGT
          </button>
        </div>
        <span className="text-body-xs text-grafana-muted group-open:rotate-180 transition-transform flex-shrink-0">&#9662;</span>
      </summary>
      <div className="px-3 pb-3 pt-2 bg-grafana-bg">
        <div className="space-y-1">
          {players.map((player, i) => {
            const tierBadgeClass = player.isDrafted
              ? "bg-grafana-positive/20 text-grafana-positive"
              : player.tier === "anchor"
              ? "bg-grafana-warning/20 text-grafana-warning"
              : player.tier === "core"
              ? "bg-grafana-info/20 text-grafana-info"
              : "bg-grafana-border text-grafana-muted";

            return (
              <div
                key={`${player.name}-${i}`}
                className={`flex items-center justify-between text-body-xs gap-2${player.isDrafted ? " opacity-60" : ""}`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span className="text-body-xs text-grafana-muted w-6 flex-shrink-0 text-right">
                    {player.slot}
                  </span>
                  {player.externalRank != null && (
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-label leading-none ${
                        player.externalRank <= 10
                          ? "bg-grafana-text text-grafana-bg"
                          : "bg-grafana-border text-grafana-muted"
                      }`}
                    >
                      {player.externalRank}
                    </span>
                  )}
                  <span
                    className={`text-body-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${tierBadgeClass}`}
                  >
                    {player.isDrafted ? "\u2713" : player.tier}
                  </span>
                  <span className={`truncate ${player.isDrafted ? "text-grafana-muted" : "font-semibold text-grafana-text"}`}>
                    {player.name}
                  </span>
                </div>
                <span className="text-grafana-muted flex-shrink-0">${Math.round(player.dollars)}</span>
              </div>
            );
          })}
        </div>

        {/* Category progress bars */}
        {idealRoster.categoryProgress && idealRoster.categoryProgress.length > 0 && (
          <div className="mt-3 border-t border-grafana-border pt-2">
            <div className="text-body-xs font-semibold text-grafana-text mb-1.5">Category Targets</div>
            <div className="space-y-1.5">
              {idealRoster.categoryProgress.map((cat) => {
                const pct = Math.min(cat.percent, 100);
                const barColor = cat.percent >= 100
                  ? "bg-grafana-positive"
                  : cat.percent >= 80
                  ? "bg-grafana-warning"
                  : "bg-grafana-negative";

                const isRate = cat.direction === "LOWER_BETTER" || cat.statKey === "OPS" || cat.statKey === "AVG" || cat.statKey === "OBP" || cat.statKey === "SLG";
                const projectedDisplay = isRate ? cat.projected.toFixed(3) : Math.round(cat.projected).toString();
                const targetDisplay = isRate ? cat.target.toFixed(3) : Math.round(cat.target).toString();

                return (
                  <div key={cat.statKey}>
                    <div className="flex items-center justify-between text-body-xs mb-0.5">
                      <span className="text-grafana-muted">{cat.statKey}</span>
                      <span className="text-grafana-muted">
                        {projectedDisplay} / {targetDisplay}
                        <span className={`ml-1 font-semibold ${cat.percent >= 100 ? "text-grafana-positive" : cat.percent >= 80 ? "text-grafana-warning" : "text-grafana-negative"}`}>
                          {Math.round(cat.percent)}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-grafana-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Unfilled slots notice */}
        {unfilledSlots > 0 && (
          <div className="text-body-xs text-grafana-muted mt-2 border-t border-grafana-border pt-2">
            {unfilledSlots} slot{unfilledSlots !== 1 ? "s" : ""} unfilled
          </div>
        )}

        {/* Budget split summary */}
        <div className="text-body-xs text-grafana-muted mt-2 border-t border-grafana-border pt-2 space-y-0.5">
          {(() => {
            const PITCHER_POS = new Set(["SP", "RP", "P"]);
            const hitterTotal = Math.round(players
              .filter(p => !p.positions.some(pos => PITCHER_POS.has(pos.toUpperCase())))
              .reduce((s, p) => s + p.dollars, 0));
            const pitcherTotal = Math.round(players
              .filter(p => p.positions.some(pos => PITCHER_POS.has(pos.toUpperCase())))
              .reduce((s, p) => s + p.dollars, 0));
            return (
              <div>
                ${hitterTotal} hitters &middot; ${pitcherTotal} pitchers &middot; ${Math.round(budgetUsed)} total
              </div>
            );
          })()}
          <div>{totalSGPValue.toFixed(1)} projected SGP</div>
        </div>
      </div>
    </details>
  );
}
