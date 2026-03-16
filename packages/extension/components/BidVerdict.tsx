import React from "react";
import { useDraftStore } from "../lib/draft-state";
import type { DraftEngineSignals } from "../lib/engine";

interface BidVerdictProps {
  engineSignals: DraftEngineSignals | null;
}

export default function BidVerdict({ engineSignals }: BidVerdictProps) {
  const { currentAuctionPlayer, remainingBudget } = useDraftStore();

  // Only render when there's a nominated player and optimization data
  if (!currentAuctionPlayer || !engineSignals?.optimization) {
    return null;
  }

  const { maxBid, shouldBid, expectedMarketPrice } = engineSignals.optimization;
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
      {/* Verdict */}
      <div
        className={`text-h4 font-bold ${
          shouldBid
            ? isRisky
              ? "text-grafana-warning"
              : "text-grafana-positive"
            : "text-grafana-negative"
        }`}
      >
        {verdictText}
      </div>

      {/* Stat pills */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-caption bg-grafana-border text-grafana-muted rounded px-2 py-0.5">
          Market ${expectedMarketPrice}
        </span>
        {winProbability !== undefined && (
          <span className="text-caption bg-grafana-border text-grafana-muted rounded px-2 py-0.5">
            Win Prob {Math.round(winProbability * 100)}%
          </span>
        )}
        {isRisky && (
          <span className="text-caption bg-grafana-warning/20 text-grafana-warning rounded px-2 py-0.5">
            Budget tight
          </span>
        )}
      </div>
    </div>
  );
}
