import React from "react";
import type { AuctionValue } from "@espn-fantasy/shared";
import {
  calculateAVG,
  calculateERA,
  calculateWHIP,
  calculateOPS,
} from "@espn-fantasy/shared";
import { useDraftStore } from "../lib/draft-state";
import { calculateBudgetPacing } from "../lib/value-calculations";
import {
  calculateAuctionValue,
  getValueColorClasses,
} from "../lib/value-detection";

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr)\.?\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

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
  actualPrice?: number; // Actual draft price (if drafted)
}

type AuctionValueWithOptionalVbd = AuctionValue & {
  vbdScore?: number;
};

export default function AuctionPlayerCard({
  player,
  rank,
  actualPrice,
}: AuctionPlayerCardProps) {
  const auctionPlayer = player as AuctionValueWithOptionalVbd;
  const { myRoster, rosterSize, rankings, espnDomAuctionValues } = useDraftStore();

  // Prefer DOM-scraped ESPN value (live from the draft page table) over
  // the backend-derived dollarValue stored on the AuctionValue object.
  const espnDisplayValue =
    player.playerId && espnDomAuctionValues[player.playerId] !== undefined
      ? espnDomAuctionValues[player.playerId]
      : player.dollarValue;

  // Calculate value indicator
  const valueIndicator = calculateAuctionValue(player, actualPrice ?? null);
  const colorClasses = getValueColorClasses(valueIndicator.color);

  // Calculate if player is affordable
  const pacing = calculateBudgetPacing(260, myRoster, rosterSize);
  const isAffordable = player.dollarValue <= pacing.recommendedMaxBid;
  const isValuePick = player.dollarValue <= pacing.averageRemainingPerPlayer;

  // Find player's projected stats from rankings
  const normalizedPlayerName = normalizePlayerName(player.playerName);
  const playerRanking = rankings.find((ranking) => {
    if (ranking.playerId === player.playerId) {
      return true;
    }

    return normalizePlayerName(ranking.playerName) === normalizedPlayerName;
  });
  const projectedStats = playerRanking?.projectedStats || {};

  const rankTextSize = rank >= 100 ? "text-xs" : "text-lg";
  const isElite = rank <= 10;

  return (
    <div className="p-3 hover:bg-accent-light cursor-pointer transition-colors">
      <div className="flex items-start gap-3">
        {/* Circular rank badge */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-display ${rankTextSize} ${
            isElite
              ? "bg-accent text-content-inverse"
              : "bg-surface-secondary text-content"
          }`}
        >
          {rank}
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
              {(playerRanking?.tierName || playerRanking?.externalRank) && (
                <div className="flex items-center gap-1 mt-0.5">
                  {playerRanking.tierName && (
                    <span className="text-xs bg-surface-tertiary text-content-secondary px-1.5 py-0.5 rounded">
                      {playerRanking.tierName}
                    </span>
                  )}
                  {playerRanking.externalRank && (
                    <span className="text-xs text-content-secondary">
                      {playerRanking.rankSource || "PL"} #{playerRanking.externalRank}
                    </span>
                  )}
                </div>
              )}
              {/* Value indicators */}
              <div className="flex gap-2 mt-2">
                {valueIndicator.severity !== "fair" && (
                  <span
                    className={`text-xs px-2 py-1 rounded border ${colorClasses.bg} ${colorClasses.text} ${colorClasses.border}`}
                    title={`VBD $${player.dollarValue} vs actual ${actualPrice ? `$${actualPrice}` : "not drafted"}`}
                  >
                    {valueIndicator.label}
                  </span>
                )}
                {!actualPrice && isValuePick && (
                  <span className="text-xs bg-positive-light text-positive px-2 py-1 rounded">
                    Value
                  </span>
                )}
                {!actualPrice && !isAffordable && (
                  <span className="text-xs bg-negative-light text-negative px-2 py-1 rounded">
                    Over budget
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-h3 font-semibold text-content">
                ${espnDisplayValue}
              </div>
              {espnDisplayValue !== player.dollarValue && (
                <div className="text-caption text-content-tertiary">
                  VBD: ${player.dollarValue}
                </div>
              )}
              <div className="text-caption text-content-tertiary">
                VBD score: {formatNumber(auctionPlayer.vbdScore, 1)}
              </div>
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
  );
}
