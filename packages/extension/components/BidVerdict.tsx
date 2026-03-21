import React, { useState } from "react";
import { useDraftStore } from "../lib/draft-state";
import type { DraftEngineSignals } from "../lib/engine";

interface BidVerdictProps {
  engineSignals: DraftEngineSignals | null;
}

export default function BidVerdict({ engineSignals }: BidVerdictProps) {
  const { currentAuctionPlayer, remainingBudget } = useDraftStore();
  const [showDebug, setShowDebug] = useState(false);

  // Only render when there's a nominated player and optimization data
  if (!currentAuctionPlayer || !engineSignals?.optimization) {
    return null;
  }

  const opt = engineSignals.optimization;
  const { maxBid, shouldBid, expectedMarketPrice, valueSurplus, capSource, simulationEV, simulationStdDev, rawBlendedValue, sgpBreakeven, priorityScore, evBuffer, categoryBonus, playerTags } = opt as any;
  const winProbability =
    engineSignals.simulation?.winProbability?.winProbability;

  // "Risky" = would bid but it would leave budget tight (< 15% remaining after bid)
  const isRisky =
    shouldBid && remainingBudget > 0
      ? remainingBudget - maxBid < remainingBudget * 0.15
      : false;

  // Border color: green for bid (not risky), amber for risky, red for pass
  const borderClass = shouldBid
    ? isRisky
      ? "border-grafana-warning"
      : "border-grafana-positive"
    : "border-grafana-negative";

  // Pass reason — explain WHY the engine is passing
  const passReason = !shouldBid ? (() => {
    if (maxBid <= 0) return "No value (max bid $0)";
    if (capSource?.includes("hitter cap")) return `Hitter budget exhausted (cap: ${capSource.match(/\$\d+/)?.[0] ?? ""})`;
    if (capSource?.includes("C filled")) return "Catcher slot already filled";
    if (capSource?.includes("need ×0.5")) return "Would go to bench — not worth it";
    if (capSource?.includes("need ×0.7") && maxBid < 3) return "UTIL slot only — bid too low";
    if (valueSurplus < -5) return `Overpriced by $${Math.abs(valueSurplus)} vs market`;
    if (maxBid < (expectedMarketPrice ?? 0)) return `Max bid $${maxBid} < market $${expectedMarketPrice}`;
    if (priorityScore != null && priorityScore <= 0) return "Negative EV — market overvalues this player";
    return `Max bid $${maxBid} — below current price`;
  })() : null;

  // Verdict text
  const verdictText = shouldBid
    ? `BID up to $${maxBid}`
    : "PASS";

  return (
    <div className={`mx-3 my-1.5 border-2 ${borderClass} rounded-card p-3 bg-grafana-panel`}>
      {/* Verdict — click to toggle debug */}
      <div
        className="cursor-pointer"
        onClick={() => setShowDebug(prev => !prev)}
        title="Click for bid reasoning"
      >
        <div className={`text-h4 font-bold ${
          shouldBid
            ? isRisky
              ? "text-grafana-warning"
              : "text-grafana-positive"
            : "text-grafana-negative"
        }`}>
          {verdictText}
        </div>
        {passReason && (
          <div className="text-caption text-grafana-muted mt-0.5">{passReason}</div>
        )}
      </div>

      {/* Stat pills */}
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className="text-caption bg-grafana-border text-grafana-muted rounded px-2 py-0.5">
          Market ${expectedMarketPrice}
        </span>
        <span className={`text-caption rounded px-2 py-0.5 ${
          valueSurplus >= 0
            ? "bg-grafana-positive/20 text-grafana-positive"
            : "bg-grafana-negative/20 text-grafana-negative"
        }`}>
          {valueSurplus >= 0 ? "+" : ""}${valueSurplus} value
        </span>
        {winProbability !== undefined && (
          <span className="text-caption bg-grafana-border text-grafana-muted rounded px-2 py-0.5">
            Win {Math.round(winProbability * 100)}%
          </span>
        )}
        {isRisky && (
          <span className="text-caption bg-grafana-warning/20 text-grafana-warning rounded px-2 py-0.5">
            Budget tight
          </span>
        )}
        {capSource?.includes("need ×0.7") && (
          <span className="text-caption bg-grafana-warning/20 text-grafana-warning rounded px-2 py-0.5">
            UTIL slot
          </span>
        )}
        {capSource?.includes("need ×0.5") && (
          <span className="text-caption bg-grafana-negative/20 text-grafana-negative rounded px-2 py-0.5">
            Bench only
          </span>
        )}
        {capSource?.includes("elite override") && (
          <span className="text-caption bg-grafana-positive/20 text-grafana-positive rounded px-2 py-0.5">
            Elite override
          </span>
        )}
      </div>

      {/* Debug panel — toggled by clicking verdict */}
      {showDebug && (
        <div className="mt-2 pt-2 border-t border-grafana-border text-caption text-grafana-muted space-y-1.5">
          {/* Priority Score Pipeline */}
          <div className="space-y-0.5">
            <div className="text-grafana-text font-medium">EV Pipeline</div>
            <div className="font-mono text-[10px] leading-relaxed">
              {sgpBreakeven != null && <div>FG$ (model): ${sgpBreakeven}</div>}
              <div>ESPN ASV (market): ${expectedMarketPrice}</div>
              {sgpBreakeven != null && expectedMarketPrice != null && (
                <div className={sgpBreakeven - expectedMarketPrice >= 0 ? "text-grafana-positive" : "text-grafana-negative"}>
                  EV: {sgpBreakeven - expectedMarketPrice >= 0 ? "+" : ""}${sgpBreakeven - expectedMarketPrice} ({sgpBreakeven > expectedMarketPrice ? "underpriced" : "overpriced"})
                </div>
              )}
              {priorityScore != null && <div>Priority score: {priorityScore.toFixed(1)}</div>}
              {evBuffer != null && evBuffer > 0 && <div>EV buffer: +${evBuffer}</div>}
              {categoryBonus != null && categoryBonus > 0 && <div>Category bonus: +${categoryBonus}</div>}
              <div>Max bid: ${maxBid}</div>
              {playerTags?.length > 0 && (
                <div className="text-grafana-accent">Tags: {playerTags.join(", ")}</div>
              )}
            </div>
          </div>
          {/* Cap chain */}
          {capSource && (
            <div className="space-y-0.5">
              <div className="text-grafana-text font-medium">Cap Chain</div>
              <div className="font-mono text-[10px] leading-tight break-all">
                {capSource}
              </div>
            </div>
          )}
          {/* State */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px]">
            <span>budget: ${remainingBudget}</span>
            {engineSignals.inflation && (
              <span>infl: {engineSignals.inflation.inflationFactor.toFixed(2)}</span>
            )}
            {engineSignals.budgetCurve && (
              <>
                <span>hit$: ${engineSignals.budgetCurve.hitterSpent}</span>
                <span>pit$: ${engineSignals.budgetCurve.pitcherSpent}</span>
              </>
            )}
            <span>sim: {shouldBid ? "BID" : "PASS"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
