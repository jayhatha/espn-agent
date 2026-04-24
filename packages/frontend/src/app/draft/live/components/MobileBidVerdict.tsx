"use client";

import { useState } from "react";
import type { CurrentAuctionPlayer, OptimizationSignal } from "../useDraftLiveSocket";

interface MobileBidVerdictProps {
  currentPlayer: CurrentAuctionPlayer | null;
  optimization: OptimizationSignal | null;
  remainingBudget: number;
}

export function MobileBidVerdict({
  currentPlayer,
  optimization,
  remainingBudget,
}: MobileBidVerdictProps) {
  const [showDebug, setShowDebug] = useState(false);

  if (!currentPlayer) {
    return (
      <div className="bg-grafana-panel border border-grafana-border rounded-xl p-4">
        <p className="text-grafana-muted text-sm text-center py-2">
          Waiting for nomination...
        </p>
      </div>
    );
  }

  const opt = optimization;
  const maxBid = opt?.maxBid ?? 0;
  const shouldBid = opt?.shouldBid ?? false;
  const valueSurplus = opt?.valueSurplus ?? 0;
  const expectedMarketPrice = opt?.expectedMarketPrice ?? 0;
  const capSource = opt?.capSource ?? null;
  const simulationEV = opt?.simulationEV ?? null;
  const sgpBreakeven = opt?.sgpBreakeven ?? null;
  const priorityScore = opt?.priorityScore ?? null;
  const evBuffer = opt?.evBuffer ?? null;
  const categoryBonus = opt?.categoryBonus ?? null;
  const playerTags = opt?.playerTags ?? null;

  // "Risky" = would bid but would leave budget tight (< 15% remaining after bid)
  const isRisky =
    shouldBid && remainingBudget > 0
      ? remainingBudget - maxBid < remainingBudget * 0.15
      : false;

  // Border color: green for bid (not risky), amber for risky, red for pass
  const borderColor = shouldBid
    ? isRisky
      ? "border-grafana-warning"
      : "border-grafana-positive"
    : "border-grafana-negative";

  // Text color for verdict
  const verdictColor = shouldBid
    ? isRisky
      ? "text-grafana-warning"
      : "text-grafana-positive"
    : "text-grafana-negative";

  // Verdict text
  const verdictText = shouldBid ? `BID up to $${maxBid}` : "PASS";

  // Pass reason
  const passReason = !shouldBid
    ? (() => {
        if (maxBid <= 0) return "No value (max bid $0)";
        if (capSource?.includes("hitter cap"))
          return `Hitter budget exhausted (cap: ${capSource.match(/\$\d+/)?.[0] ?? ""})`;
        if (capSource?.includes("C filled")) return "Catcher slot already filled";
        if (capSource?.includes("need ×0.5")) return "Would go to bench — not worth it";
        if (capSource?.includes("need ×0.7") && maxBid < 3)
          return "UTIL slot only — bid too low";
        if (valueSurplus < -5)
          return `Overpriced by $${Math.abs(valueSurplus)} vs market`;
        if (maxBid < (expectedMarketPrice ?? 0))
          return `Max bid $${maxBid} < market $${expectedMarketPrice}`;
        if (priorityScore != null && priorityScore <= 0)
          return "Negative EV — market overvalues this player";
        return `Max bid $${maxBid} — below current price`;
      })()
    : null;

  return (
    <div
      className={`bg-grafana-panel border-2 ${borderColor} rounded-xl p-4`}
    >
      {/* Player header */}
      <div className="mb-2">
        <p className="text-grafana-text text-base font-bold leading-tight">
          {currentPlayer.playerName}
        </p>
        <p className="text-grafana-muted text-sm mt-0.5">
          {currentPlayer.positions?.join("/") ?? ""}
          {currentPlayer.nominatingTeam && (
            <span className="ml-2 text-grafana-muted/70">
              — {currentPlayer.nominatingTeam}
            </span>
          )}
          {currentPlayer.currentBid !== undefined && (
            <span className="ml-2 font-mono text-grafana-text">
              Current: <span className="font-bold">${currentPlayer.currentBid}</span>
            </span>
          )}
        </p>
      </div>

      {/* Verdict — tap to toggle debug */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Toggle bid reasoning details"
        aria-expanded={showDebug}
        className="cursor-pointer"
        onClick={() => setShowDebug((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowDebug((prev) => !prev);
          }
        }}
        title="Tap for bid reasoning"
      >
        <div className={`text-2xl font-bold ${verdictColor}`}>{verdictText}</div>
        {passReason && (
          <div className="text-sm text-grafana-muted mt-0.5">{passReason}</div>
        )}
      </div>

      {/* Stat pills */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-xs bg-grafana-border text-grafana-muted rounded px-2 py-0.5">
          Market ${expectedMarketPrice}
        </span>
        <span
          className={`text-xs rounded px-2 py-0.5 ${
            valueSurplus >= 0
              ? "bg-grafana-positive/20 text-grafana-positive"
              : "bg-grafana-negative/20 text-grafana-negative"
          }`}
        >
          {valueSurplus >= 0 ? "+" : ""}${valueSurplus} value
        </span>
        {isRisky && (
          <span className="text-xs bg-grafana-warning/20 text-grafana-warning rounded px-2 py-0.5">
            Budget tight
          </span>
        )}
        {capSource?.includes("need ×0.7") && (
          <span className="text-xs bg-grafana-warning/20 text-grafana-warning rounded px-2 py-0.5">
            UTIL slot
          </span>
        )}
        {capSource?.includes("need ×0.5") && (
          <span className="text-xs bg-grafana-negative/20 text-grafana-negative rounded px-2 py-0.5">
            Bench only
          </span>
        )}
        {capSource?.includes("elite override") && (
          <span className="text-xs bg-grafana-positive/20 text-grafana-positive rounded px-2 py-0.5">
            Elite override
          </span>
        )}
      </div>

      {/* Debug panel — toggled by tapping verdict */}
      {showDebug && (
        <div className="mt-3 pt-3 border-t border-grafana-border text-sm text-grafana-muted space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {sgpBreakeven != null && (
              <>
                <span className="text-grafana-muted/70">FG$</span>
                <span className="font-mono text-grafana-text">
                  ${sgpBreakeven}{" "}
                  <span className="text-grafana-muted/70 text-xs">
                    (mkt ${expectedMarketPrice})
                  </span>
                </span>
              </>
            )}
            {simulationEV != null && (
              <>
                <span className="text-grafana-muted/70">EV</span>
                <span
                  className={`font-mono ${
                    simulationEV >= 0 ? "text-grafana-positive" : "text-grafana-negative"
                  }`}
                >
                  {simulationEV >= 0 ? "+" : ""}
                  {simulationEV.toFixed(2)}
                </span>
              </>
            )}
            {priorityScore != null && (
              <>
                <span className="text-grafana-muted/70">Priority</span>
                <span className="font-mono text-grafana-text">
                  {priorityScore.toFixed(1)}
                </span>
              </>
            )}
            {evBuffer != null && (
              <>
                <span className="text-grafana-muted/70">EV Buffer</span>
                <span className="font-mono text-grafana-text">
                  {evBuffer > 0 ? "+" : ""}${evBuffer}
                </span>
              </>
            )}
            {categoryBonus != null && (
              <>
                <span className="text-grafana-muted/70">Category Bonus</span>
                <span className="font-mono text-grafana-text">
                  {categoryBonus > 0 ? "+" : ""}${categoryBonus}
                </span>
              </>
            )}
            {capSource && (
              <>
                <span className="text-grafana-muted/70">Cap</span>
                <span className="font-mono text-grafana-text text-xs break-all">
                  {capSource}
                </span>
              </>
            )}
            {sgpBreakeven != null && (
              <>
                <span className="text-grafana-muted/70">SGP Break-even</span>
                <span className="font-mono text-grafana-text">${sgpBreakeven}</span>
              </>
            )}
          </div>
          {playerTags != null && playerTags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {playerTags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-grafana-border text-info-dark rounded px-2 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
