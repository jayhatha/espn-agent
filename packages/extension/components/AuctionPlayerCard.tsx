import React, { useState } from "react";
import type { AuctionValue } from "@espn-fantasy/shared";
import {
  calculateAVG,
  calculateERA,
  calculateWHIP,
  calculateOPS,
} from "@espn-fantasy/shared";
import { useDraftStore } from "../lib/draft-state";
import { calculateBudgetPacing } from "../lib/value-calculations";
import { calculateFgVsMarket, getValueColorClasses } from "../lib/value-detection";
import { normalizeName as normalizePlayerName } from "../lib/engine/normalizer";

function formatNumber(value: unknown, digits: number): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0.0";
  }

  return numericValue.toFixed(digits);
}

interface AuctionPlayerCardProps {
  player: AuctionValue;
  rank: number;
  actualPrice?: number;
}

export default function AuctionPlayerCard({
  player,
  rank,
  actualPrice,
}: AuctionPlayerCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { myRoster, rosterSize, rankings, espnDomAuctionValues } = useDraftStore();

  // Find player's ranking data (for external rank, tier, projected stats)
  const normalizedName = normalizePlayerName(player.playerName);
  const playerRanking = rankings.find((ranking) => {
    if (ranking.playerId === player.playerId) return true;
    return normalizePlayerName(ranking.playerName) === normalizedName;
  });

  // Display rank: external rank if available, otherwise list position
  const displayRank = playerRanking?.externalRank ?? rank;

  // Prefer DOM-scraped ESPN value (live from the draft page table)
  const espnDisplayValue =
    player.playerId && espnDomAuctionValues[player.playerId] !== undefined
      ? espnDomAuctionValues[player.playerId]
      : null;

  // Primary dollar value is from FanGraphs auction CSV
  const auctionDollarValue = player.dollarValue;

  // ESPN ASV as primary market value; fall back to FG value when unavailable
  const marketValue = espnDisplayValue ?? auctionDollarValue;

  // FG comparison badge (only when ESPN ASV is available)
  const fgIndicator = espnDisplayValue !== null
    ? calculateFgVsMarket(auctionDollarValue, espnDisplayValue)
    : null;

  // Calculate if player is affordable (use market value for budget pacing)
  const pacing = calculateBudgetPacing(260, myRoster, rosterSize);
  const isAffordable = marketValue <= pacing.recommendedMaxBid;

  const projectedStats = playerRanking?.projectedStats || {};

  const rankTextSize = displayRank >= 100 ? "text-xs" : "text-lg";
  const isElite = displayRank <= 10;

  return (
    <div
      className="hover:bg-accent-light cursor-pointer transition-colors"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      {!isExpanded ? (
        /* Compact single-row view */
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Circular rank badge */}
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-display text-xs ${
              isElite
                ? "bg-accent text-content-inverse"
                : "bg-surface-secondary text-content"
            }`}
          >
            {displayRank}
          </div>

          {/* Player name */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-content text-sm truncate">{player.playerName}</div>
          </div>

          {/* Positions */}
          <div className="text-caption text-content-tertiary shrink-0">
            {player.positions.join("/")}
          </div>

          {/* Dollar value pill */}
          <div className="text-sm font-semibold text-content shrink-0">
            ${marketValue}
          </div>

          {/* Expand chevron */}
          <svg className="w-4 h-4 text-content-tertiary shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,6 8,10 12,6" />
          </svg>
        </div>
      ) : (
        /* Expanded full view */
        <div className="p-3">
          <div className="flex items-start gap-3">
            {/* Circular rank badge — shows external rank */}
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-display ${rankTextSize} ${
                isElite
                  ? "bg-accent text-content-inverse"
                  : "bg-surface-secondary text-content"
              }`}
            >
              {displayRank}
            </div>

            {/* Player info */}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start mb-1">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-content truncate">{player.playerName}</div>
                  <div className="text-caption text-content-tertiary">
                    {player.positions.join(", ")}
                    {playerRanking?.adp && (
                      <span className="ml-2 text-content-secondary">
                        ADP: {formatNumber(playerRanking.adp, 1)}
                      </span>
                    )}
                  </div>
                  {(playerRanking?.tierName) && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs bg-surface-tertiary text-content-secondary px-1.5 py-0.5 rounded">
                        {playerRanking.tierName}
                      </span>
                      {playerRanking.rankSource && (
                        <span className="text-xs text-content-tertiary">
                          {playerRanking.rankSource}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Value indicators */}
                  <div className="flex gap-2 mt-2">
                    {!actualPrice && !isAffordable && (
                      <span className="text-xs bg-negative-light text-negative px-2 py-1 rounded">
                        Over budget
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1">
                    <div className="text-h3 font-semibold text-content">
                      ${marketValue}
                    </div>
                    <svg className="w-4 h-4 text-content-tertiary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4,10 8,6 12,10" />
                    </svg>
                  </div>
                  {espnDisplayValue === null && (
                    <div className="text-caption text-content-tertiary">FG</div>
                  )}
                  {fgIndicator && (() => {
                    const colors = getValueColorClasses(fgIndicator.color);
                    return (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                        {fgIndicator.label}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Projected stats */}
              <div className="text-data text-content-secondary mt-2 flex gap-3 flex-wrap">
                {projectedStats.HR && <span>HR: {projectedStats.HR}</span>}
                {projectedStats.RBI && <span>RBI: {projectedStats.RBI}</span>}
                {projectedStats.SB && <span>SB: {projectedStats.SB}</span>}
                {projectedStats.W && <span>W: {projectedStats.W}</span>}
                {projectedStats.SV && <span>SV: {projectedStats.SV}</span>}
                {projectedStats.AB && projectedStats.AB > 0 && (
                  <>
                    <span>AVG: {formatNumber(calculateAVG(projectedStats), 3)}</span>
                    <span>OPS: {formatNumber(calculateOPS(projectedStats), 3)}</span>
                  </>
                )}
                {projectedStats.IP && projectedStats.IP > 0 && (
                  <>
                    <span>ERA: {formatNumber(calculateERA(projectedStats), 2)}</span>
                    <span>WHIP: {formatNumber(calculateWHIP(projectedStats), 2)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
