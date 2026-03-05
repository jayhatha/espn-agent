import React from "react";
import type { DraftEngineSignals } from "../lib/engine";
import BuildArchetypePanel from "./BuildArchetypePanel";

interface EngineInsightsProps {
  engineSignals: DraftEngineSignals | null;
}

export default function EngineInsights({ engineSignals }: EngineInsightsProps) {
  if (!engineSignals) {
    return null;
  }

  const { inflation, scarcity } = engineSignals;

  // Inflation color: green < 5%, neutral 5-15%, warning > 15%
  const inflationPct = inflation.percentOverMarket;
  const inflationColorClass =
    Math.abs(inflationPct) < 5
      ? "text-positive"
      : Math.abs(inflationPct) < 15
      ? "text-content"
      : "text-warning";

  const inflationSign = inflationPct >= 0 ? "+" : "";

  // Top 3 scarcity positions
  const topScarcity = [...scarcity]
    .sort((a, b) => b.scarcityIndex - a.scarcityIndex)
    .slice(0, 3);

  return (
    <div className="border-b border-surface-tertiary">
      {/* Inflation section */}
      <details open className="group">
        <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none">
          <span className="text-body-sm font-semibold text-content">Inflation</span>
          <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
        </summary>
        <div className="px-3 pb-3 pt-2 bg-surface">
          <div className="flex items-baseline gap-2 mb-1">
            <span className={`text-h2 font-display ${inflationColorClass}`}>
              {inflationSign}{Math.round(inflationPct)}%
            </span>
            <span
              className={`text-body-xs font-semibold px-1.5 py-0.5 rounded ${
                inflation.confidence === "high"
                  ? "bg-positive-light text-positive"
                  : "bg-warning-light text-warning"
              }`}
            >
              {inflation.confidence.toUpperCase()}
            </span>
          </div>
          <div className="text-body-xs text-content-secondary">
            League budget remaining: ${Math.round(inflation.totalRemainingBudget)}
          </div>
        </div>
      </details>

      {/* Build Analysis section */}
      <BuildArchetypePanel signal={engineSignals.archetype} />

      {/* Top Scarcity section */}
      {topScarcity.length > 0 && (
        <details open className="group">
          <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
            <span className="text-body-sm font-semibold text-content">Top Scarcity</span>
            <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-2 bg-surface space-y-1.5">
            {topScarcity.map((pos) => {
              const scarcityPct = Math.round(pos.scarcityIndex * 100);
              const scarcityColorClass =
                pos.scarcityIndex >= 0.8
                  ? "text-negative"
                  : pos.scarcityIndex >= 0.6
                  ? "text-warning"
                  : "text-content-secondary";

              return (
                <div
                  key={pos.position}
                  className={`flex items-center justify-between text-body-xs ${
                    pos.myTeamNeeds ? "ring-1 ring-accent rounded px-1.5 py-1" : ""
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-content">
                      {pos.position}
                      {pos.myTeamNeeds && (
                        <span className="ml-1 text-accent font-normal">(you)</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-content-secondary">
                      {pos.supply}/{pos.demand}
                    </span>
                    <span className={`font-semibold ${scarcityColorClass}`}>
                      {scarcityPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
