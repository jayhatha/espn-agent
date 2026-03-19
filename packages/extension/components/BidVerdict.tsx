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
  const { maxBid, shouldBid, expectedMarketPrice, valueSurplus, capSource, simulationEV, simulationStdDev } = opt;
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
      </div>

      {/* Debug panel — toggled by clicking verdict */}
      {showDebug && (
        <div className="mt-2 pt-2 border-t border-grafana-border text-caption text-grafana-muted space-y-1">
          {capSource && (
            <div className="font-mono text-[10px] leading-tight break-all">
              {capSource}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>maxBid: ${maxBid}</span>
            <span>market: ${expectedMarketPrice}</span>
            <span>surplus: ${valueSurplus}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>shouldBid: {shouldBid ? "true" : "false"}</span>
            {simulationEV > 0 && <span>simEV: {simulationEV.toFixed(1)}</span>}
            {simulationStdDev > 0 && <span>simSD: {simulationStdDev.toFixed(1)}</span>}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>budget: ${remainingBudget}</span>
            {engineSignals.inflation && (
              <span>inflation: {engineSignals.inflation.inflationFactor.toFixed(2)}</span>
            )}
            {engineSignals.budgetCurve && (
              <>
                <span>hitSpent: ${engineSignals.budgetCurve.hitterSpent}</span>
                <span>pitSpent: ${engineSignals.budgetCurve.pitcherSpent}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
