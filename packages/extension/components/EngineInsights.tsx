import React from "react";
import type { DraftEngineSignals } from "../lib/engine";

interface EngineInsightsProps {
  engineSignals: DraftEngineSignals | null;
}

export default function EngineInsights({ engineSignals }: EngineInsightsProps) {
  if (!engineSignals) {
    return null;
  }

  const { inflation, categoryGaps, scarcity } = engineSignals;

  // Inflation color: green < 5%, neutral 5-15%, warning > 15%
  const inflationPct = inflation.percentOverMarket;
  const inflationColorClass =
    Math.abs(inflationPct) < 5
      ? "text-positive"
      : Math.abs(inflationPct) < 15
      ? "text-content"
      : "text-warning";

  const inflationSign = inflationPct >= 0 ? "+" : "";

  // Category gaps: show risk > 0.3 for context (broader than alerts)
  const riskyCats = [...categoryGaps]
    .filter((c) => c.categoryRiskScore > 0.3)
    .sort((a, b) => b.categoryRiskScore - a.categoryRiskScore);

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
            Remaining value: ${Math.round(inflation.totalRemainingValue)} &middot; Remaining budget: ${Math.round(inflation.totalRemainingBudget)}
          </div>
        </div>
      </details>

      {/* Category Gaps section */}
      {riskyCats.length > 0 && (
        <details open className="group">
          <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
            <span className="text-body-sm font-semibold text-content">Category Gaps</span>
            <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <div className="px-3 pb-3 pt-2 bg-surface space-y-1.5">
            {riskyCats.map((gap) => {
              const zScore = gap.gapZScore;
              // For LOWER_BETTER categories, negative z-score is actually good
              const effectivelyPositive =
                gap.direction === "LOWER_BETTER" ? zScore <= 0 : zScore >= 0;
              const zColorClass = effectivelyPositive ? "text-positive" : "text-negative";
              const zSign = zScore >= 0 ? "+" : "";
              // Bar: center = 0, range -3 to +3 mapped to 0-100%
              const barPct = Math.min(100, Math.max(0, ((zScore + 3) / 6) * 100));
              const barColorClass = effectivelyPositive ? "bg-positive" : "bg-negative";

              return (
                <div key={gap.category} className="flex items-center gap-2">
                  <div className="w-12 text-body-xs font-semibold text-content truncate shrink-0">
                    {gap.category}
                  </div>
                  <div className="flex-1 relative h-3 bg-surface-tertiary rounded-full overflow-hidden">
                    {/* Center marker */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-content-secondary/30" />
                    {/* Value bar from center */}
                    <div
                      className={`absolute top-0.5 bottom-0.5 ${barColorClass} rounded-full`}
                      style={{
                        left: zScore >= 0 ? "50%" : `${barPct}%`,
                        right: zScore >= 0 ? `${100 - barPct}%` : "50%",
                      }}
                    />
                  </div>
                  <span className={`text-body-xs font-semibold w-10 text-right shrink-0 ${zColorClass}`}>
                    {zSign}{zScore.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

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
