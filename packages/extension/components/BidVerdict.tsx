import React from "react";
import { useDraftStore } from "../lib/draft-state";
import { useNarratorStore } from "../lib/narrator-state";
import type { DraftEngineSignals } from "../lib/engine";

interface BidVerdictProps {
  engineSignals: DraftEngineSignals | null;
}

export default function BidVerdict({ engineSignals }: BidVerdictProps) {
  const { currentAuctionPlayer, remainingBudget } = useDraftStore();
  const narration = useNarratorStore((s) => s.narration);

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
      ? "border-warning"
      : "border-positive"
    : "border-negative";

  // Verdict text
  const verdictText = shouldBid
    ? `BID up to $${maxBid}`
    : "PASS";

  // Truncate narrator rationale to first sentence
  const firstSentence =
    narration && narration.trim()
      ? (() => {
          const idx = narration.indexOf(". ");
          return idx !== -1 ? narration.slice(0, idx + 1) : narration.trim();
        })()
      : null;

  return (
    <div className={`mx-4 my-2 border-2 ${borderClass} rounded-card p-3`}>
      {/* Verdict */}
      <div
        className={`text-h4 font-display font-bold ${
          shouldBid
            ? isRisky
              ? "text-warning"
              : "text-positive"
            : "text-negative"
        }`}
      >
        {verdictText}
      </div>

      {/* Stat pills */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-caption bg-surface-tertiary rounded px-2 py-0.5">
          Market ${expectedMarketPrice}
        </span>
        {winProbability !== undefined && (
          <span className="text-caption bg-surface-tertiary rounded px-2 py-0.5">
            Win Prob {Math.round(winProbability * 100)}%
          </span>
        )}
        {isRisky && (
          <span className="text-caption bg-warning-light text-warning rounded px-2 py-0.5">
            Budget tight
          </span>
        )}
      </div>

      {/* One-sentence narrator rationale */}
      {firstSentence && (
        <p className="text-body-sm text-content-secondary mt-1">
          {firstSentence}
        </p>
      )}
    </div>
  );
}
