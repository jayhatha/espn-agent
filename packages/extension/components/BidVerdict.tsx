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
  const { maxBid, shouldBid, expectedMarketPrice, valueSurplus, capSource, simulationEV, simulationStdDev, rawBlendedValue, sgpBreakeven } = opt;
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

  // Verdict text
  const verdictText = shouldBid
    ? `BID up to $${maxBid}`
    : "PASS";

  return (
    <div className={`mx-3 my-1.5 border-2 ${borderClass} rounded-card p-3 bg-grafana-panel`}>
      {/* Verdict — click to toggle debug */}
      <div
        className={`text-h4 font-bold cursor-pointer ${
          shouldBid
            ? isRisky
              ? "text-grafana-warning"
              : "text-grafana-positive"
            : "text-grafana-negative"
        }`}
        onClick={() => setShowDebug(prev => !prev)}
        title="Click for bid reasoning"
      >
        {verdictText}
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
          {/* Value pipeline */}
          <div className="space-y-0.5">
            <div className="text-grafana-text font-medium">Value Pipeline</div>
            <div className="font-mono text-[10px] leading-relaxed">
              {sgpBreakeven != null && <div>SGP value: ${sgpBreakeven}</div>}
              <div>ESPN ASV (market): ${expectedMarketPrice}</div>
              {rawBlendedValue != null && rawBlendedValue > 0 && (
                <div>Blended (40% SGP + 60% ASV): ${rawBlendedValue}</div>
              )}
              {rawBlendedValue != null && rawBlendedValue > maxBid && (
                <div className="text-grafana-warning">
                  Capped ${rawBlendedValue} → ${maxBid} ({rawBlendedValue - maxBid > 0 ? `-$${rawBlendedValue - maxBid}` : "no change"})
                </div>
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
